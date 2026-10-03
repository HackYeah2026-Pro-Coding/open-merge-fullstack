use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::{
    constants::VAULT_SEED,
    error::EscrowErrorCode,
    state::{Escrow, EscrowStatus},
};

#[derive(Accounts)]
pub struct CreateAndDeposit<'info> {
    #[account(mut)]
    pub client: Signer<'info>,
    /// CHECK: only its key is stored as the escrow's verifier
    pub verifier: UncheckedAccount<'info>,
    pub token_mint: InterfaceAccount<'info, Mint>,
    // new keypair account, must sign the transaction
    #[account(init, payer = client, space = 8 + Escrow::INIT_SPACE)]
    pub escrow: Account<'info, Escrow>,
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = client,
        token::token_program = token_program
    )]
    pub client_token_account: InterfaceAccount<'info, TokenAccount>,
    // PDA token account that is its own authority, so only this program can move funds
    #[account(
        init,
        payer = client,
        seeds = [VAULT_SEED, escrow.key().as_ref()],
        bump,
        token::mint = token_mint,
        token::authority = vault_token_account,
        token::token_program = token_program
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    // classic SPL Token or Token-2022, must match the mint's owner
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_and_deposit(ctx: Context<CreateAndDeposit>, amount: u64) -> Result<()> {
    require!(amount > 0, EscrowErrorCode::InvalidAmount);

    let escrow = &mut ctx.accounts.escrow;

    // set data in escrow context
    escrow.client = ctx.accounts.client.key();
    escrow.developer = None;
    escrow.verifier = ctx.accounts.verifier.key();
    escrow.token_mint = ctx.accounts.token_mint.key();
    escrow.amount = amount;
    escrow.status = EscrowStatus::Funded;

    // transfer from client to vault
    let cpi_accounts = TransferChecked {
        from: ctx.accounts.client_token_account.to_account_info(),
        mint: ctx.accounts.token_mint.to_account_info(),
        to: ctx.accounts.vault_token_account.to_account_info(),
        authority: ctx.accounts.client.to_account_info(),
    };

    let cpi_program = ctx.accounts.token_program.key();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

    token_interface::transfer_checked(cpi_ctx, amount, ctx.accounts.token_mint.decimals)?;

    Ok(())
}
