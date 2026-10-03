use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{
    constants::VAULT_SEED,
    error::EscrowErrorCode,
    state::{Escrow, EscrowStatus},
};

#[derive(Accounts)]
pub struct Release<'info> {
    // pays rent if the developer's token account has to be created
    #[account(mut)]
    pub verifier: Signer<'info>,
    #[account(mut)]
    pub escrow: Account<'info, Escrow>,
    /// CHECK: receiver of the payout, chosen by the verifier; only used as the token account authority
    pub developer: UncheckedAccount<'info>,
    #[account(address = escrow.token_mint)]
    pub token_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        seeds = [VAULT_SEED, escrow.key().as_ref()],
        bump
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    // developer's ATA, created if the developer never held this token
    #[account(
        init_if_needed,
        payer = verifier,
        associated_token::mint = token_mint,
        associated_token::authority = developer,
        associated_token::token_program = token_program
    )]
    pub developer_token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_release(ctx: Context<Release>) -> Result<()> {
    let escrow = &mut ctx.accounts.escrow;

    // check it transaction not made
    require!(
        escrow.status == EscrowStatus::Funded,
        EscrowErrorCode::AlreadyProcessed
    );

    // validate CI keys
    require_keys_eq!(
        ctx.accounts.verifier.key(),
        escrow.verifier,
        EscrowErrorCode::UnauthorizedVerifier
    );

    // Seed to sign by PDA
    let escrow_key = escrow.key();
    let seeds = &[
        VAULT_SEED,
        escrow_key.as_ref(),
        &[ctx.bumps.vault_token_account],
    ];
    let signer_seeds = &[&seeds[..]];

    // Transfer from vault to developer
    let cpi_accounts = TransferChecked {
        from: ctx.accounts.vault_token_account.to_account_info(),
        mint: ctx.accounts.token_mint.to_account_info(),
        to: ctx.accounts.developer_token_account.to_account_info(),
        authority: ctx.accounts.vault_token_account.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.key();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

    token_interface::transfer_checked(cpi_ctx, escrow.amount, ctx.accounts.token_mint.decimals)?;

    // change status and record who got paid
    escrow.status = EscrowStatus::Released;
    escrow.developer = Some(ctx.accounts.developer.key());

    Ok(())
}
