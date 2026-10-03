// Escrow flow tests: create_and_deposit -> release.
//
// Runs the compiled program (target/deploy/anchor.so) inside LiteSVM, a local
// in-process Solana runtime, so no solana-test-validator is needed.
// Build the program first: `anchor build`.

use anchor::{state::Escrow, state::EscrowStatus, VAULT_SEED};
use anchor_lang::{
    prelude::Pubkey,
    solana_program::{
        instruction::Instruction, program_pack::Pack, system_instruction, system_program,
    },
    AccountDeserialize, InstructionData, ToAccountMetas,
};
use anchor_spl::{
    associated_token::{self, get_associated_token_address, spl_associated_token_account},
    token::{self, spl_token},
};
use litesvm::{types::TransactionResult, LiteSVM};
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_transaction::Transaction;

const PROGRAM_SO: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/deploy/anchor.so");

const DECIMALS: u8 = 6;
const ONE_TOKEN: u64 = 10u64.pow(DECIMALS as u32);
const CLIENT_START_BALANCE: u64 = 1_000 * ONE_TOKEN;
const ESCROW_AMOUNT: u64 = 50 * ONE_TOKEN;
const LAMPORTS_PER_SOL: u64 = 1_000_000_000;

struct Env {
    svm: LiteSVM,
    client: Keypair,
    developer: Keypair,
    verifier: Keypair,
    mint: Pubkey,
    client_token_account: Pubkey,
    escrow: Keypair,
    vault: Pubkey,
}

/// Fresh chain with the program loaded, a token mint, and a client holding 1000 tokens.
fn setup() -> Env {
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(anchor::ID, PROGRAM_SO)
        .unwrap_or_else(|e| panic!("cannot load {PROGRAM_SO} ({e:?}), run `anchor build` first"));

    let client = Keypair::new();
    let developer = Keypair::new();
    let verifier = Keypair::new();
    svm.airdrop(&client.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();
    svm.airdrop(&verifier.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();

    // token mint, client is the mint authority
    let mint = Keypair::new();
    let mint_rent = svm.minimum_balance_for_rent_exemption(spl_token::state::Mint::LEN);
    let client_token_account = get_associated_token_address(&client.pubkey(), &mint.pubkey());
    let setup_ixs = [
        system_instruction::create_account(
            &client.pubkey(),
            &mint.pubkey(),
            mint_rent,
            spl_token::state::Mint::LEN as u64,
            &token::ID,
        ),
        spl_token::instruction::initialize_mint2(
            &token::ID,
            &mint.pubkey(),
            &client.pubkey(),
            None,
            DECIMALS,
        )
        .unwrap(),
        spl_associated_token_account::instruction::create_associated_token_account(
            &client.pubkey(),
            &client.pubkey(),
            &mint.pubkey(),
            &token::ID,
        ),
        spl_token::instruction::mint_to(
            &token::ID,
            &mint.pubkey(),
            &client_token_account,
            &client.pubkey(),
            &[],
            CLIENT_START_BALANCE,
        )
        .unwrap(),
    ];
    send(&mut svm, &setup_ixs, &client, &[&mint]).expect("token setup failed");

    let escrow = Keypair::new();
    let (vault, _) =
        Pubkey::find_program_address(&[VAULT_SEED, escrow.pubkey().as_ref()], &anchor::ID);

    Env {
        svm,
        client,
        developer,
        verifier,
        mint: mint.pubkey(),
        client_token_account,
        escrow,
        vault,
    }
}

fn send(
    svm: &mut LiteSVM,
    ixs: &[Instruction],
    payer: &Keypair,
    extra_signers: &[&Keypair],
) -> TransactionResult {
    // new blockhash per tx, so sending the same instruction twice is not a duplicate tx
    svm.expire_blockhash();
    let mut signers = vec![payer];
    signers.extend_from_slice(extra_signers);
    let tx = Transaction::new_signed_with_payer(
        ixs,
        Some(&payer.pubkey()),
        &signers,
        svm.latest_blockhash(),
    );
    svm.send_transaction(tx)
}

fn create_and_deposit(env: &mut Env, amount: u64) -> TransactionResult {
    let ix = Instruction {
        program_id: anchor::ID,
        accounts: anchor::accounts::CreateAndDeposit {
            client: env.client.pubkey(),
            verifier: env.verifier.pubkey(),
            token_mint: env.mint,
            escrow: env.escrow.pubkey(),
            client_token_account: env.client_token_account,
            vault_token_account: env.vault,
            token_program: token::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: anchor::instruction::CreateAndDeposit { amount }.data(),
    };
    send(&mut env.svm, &[ix], &env.client, &[&env.escrow])
}

/// `caller` signs as the verifier (and pays for the developer's token account if needed).
fn release(env: &mut Env, caller: &Keypair) -> TransactionResult {
    let ix = Instruction {
        program_id: anchor::ID,
        accounts: anchor::accounts::Release {
            verifier: caller.pubkey(),
            escrow: env.escrow.pubkey(),
            developer: env.developer.pubkey(),
            token_mint: env.mint,
            vault_token_account: env.vault,
            developer_token_account: developer_token_account(env),
            token_program: token::ID,
            associated_token_program: associated_token::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: anchor::instruction::Release {}.data(),
    };
    send(&mut env.svm, &[ix], caller, &[])
}

fn developer_token_account(env: &Env) -> Pubkey {
    get_associated_token_address(&env.developer.pubkey(), &env.mint)
}

/// Token balance, 0 if the token account does not exist yet.
fn token_balance(env: &Env, token_account: &Pubkey) -> u64 {
    match env.svm.get_account(token_account) {
        Some(acc) if !acc.data.is_empty() => {
            spl_token::state::Account::unpack(&acc.data).unwrap().amount
        }
        _ => 0,
    }
}

fn escrow_state(env: &Env) -> Escrow {
    let acc = env.svm.get_account(&env.escrow.pubkey()).expect("escrow account missing");
    Escrow::try_deserialize(&mut acc.data.as_slice()).unwrap()
}

fn assert_rejected_with(result: TransactionResult, error_name: &str) {
    match result {
        Ok(meta) => panic!(
            "expected the tx to fail with {error_name}, but it succeeded\n{}",
            meta.pretty_logs()
        ),
        Err(failed) => assert!(
            failed.meta.logs.iter().any(|l| l.contains(error_name)),
            "expected error {error_name}, got {:?}\n{}",
            failed.err,
            failed.meta.pretty_logs()
        ),
    }
}

#[test]
fn test_1_client_deposits_50() {
    let mut env = setup();

    create_and_deposit(&mut env, ESCROW_AMOUNT).expect("deposit should succeed");

    assert_eq!(
        token_balance(&env, &env.client_token_account),
        CLIENT_START_BALANCE - ESCROW_AMOUNT
    );
}

#[test]
fn test_2_escrow_contains_50() {
    let mut env = setup();
    create_and_deposit(&mut env, ESCROW_AMOUNT).unwrap();

    assert_eq!(token_balance(&env, &env.vault), ESCROW_AMOUNT);

    let escrow = escrow_state(&env);
    assert_eq!(escrow.amount, ESCROW_AMOUNT);
    assert_eq!(escrow.client, env.client.pubkey());
    assert_eq!(escrow.developer, None);
    assert_eq!(escrow.verifier, env.verifier.pubkey());
    assert_eq!(escrow.token_mint, env.mint);
    assert!(escrow.status == EscrowStatus::Funded);
}

#[test]
fn test_3_random_wallet_release_rejected() {
    let mut env = setup();
    create_and_deposit(&mut env, ESCROW_AMOUNT).unwrap();

    let random = Keypair::new();
    env.svm.airdrop(&random.pubkey(), LAMPORTS_PER_SOL).unwrap();

    assert_rejected_with(release(&mut env, &random), "UnauthorizedVerifier");
    assert_eq!(token_balance(&env, &env.vault), ESCROW_AMOUNT);
    assert_eq!(token_balance(&env, &developer_token_account(&env)), 0);
}

#[test]
fn test_4_client_release_rejected() {
    let mut env = setup();
    create_and_deposit(&mut env, ESCROW_AMOUNT).unwrap();

    let client = env.client.insecure_clone();
    assert_rejected_with(release(&mut env, &client), "UnauthorizedVerifier");
    assert_eq!(token_balance(&env, &env.vault), ESCROW_AMOUNT);
    assert_eq!(token_balance(&env, &developer_token_account(&env)), 0);
}

#[test]
fn test_5_verifier_release_succeeds() {
    let mut env = setup();
    create_and_deposit(&mut env, ESCROW_AMOUNT).unwrap();

    let verifier = env.verifier.insecure_clone();
    release(&mut env, &verifier).expect("verifier release should succeed");

    assert!(escrow_state(&env).status == EscrowStatus::Released);
}

#[test]
fn test_6_developer_received_50() {
    let mut env = setup();
    create_and_deposit(&mut env, ESCROW_AMOUNT).unwrap();
    let verifier = env.verifier.insecure_clone();
    release(&mut env, &verifier).unwrap();

    assert_eq!(token_balance(&env, &developer_token_account(&env)), ESCROW_AMOUNT);
    assert_eq!(token_balance(&env, &env.vault), 0);
    assert_eq!(escrow_state(&env).developer, Some(env.developer.pubkey()));
}

#[test]
fn test_7_second_release_rejected() {
    let mut env = setup();
    create_and_deposit(&mut env, ESCROW_AMOUNT).unwrap();
    let verifier = env.verifier.insecure_clone();
    release(&mut env, &verifier).unwrap();

    assert_rejected_with(release(&mut env, &verifier), "AlreadyProcessed");
    assert_eq!(token_balance(&env, &developer_token_account(&env)), ESCROW_AMOUNT);
}
