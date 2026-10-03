use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::{
    constants::VAULT_SEED,
    error::EscrowErrorCode,
    state::{Escrow, EscrowStatus},
};

#[derive(Accounts)]
pub struct Cancel<'info> {
    pub verifier: Signer<'info>,
    #[account(mut)]
    pub escrow: Account<'info, Escrow>,
    #[account(address = escrow.token_mint)]
    pub token_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        seeds = [VAULT_SEED, escrow.key().as_ref()],
        bump
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = token_mint,
        token::token_program = token_program,
        constraint = client_token_account.owner == escrow.client @ EscrowErrorCode::InvalidClient
    )]
    pub client_token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_cancel(ctx: Context<Cancel>) -> Result<()> {
    let escrow = &mut ctx.accounts.escrow;

    // check it transaction not made
    require!(
        escrow.status == EscrowStatus::Funded,
        EscrowErrorCode::AlreadyProcessed
    );

    // only verifier can cancel
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

    // Refund from vault to client
    let cpi_accounts = TransferChecked {
        from: ctx.accounts.vault_token_account.to_account_info(),
        mint: ctx.accounts.token_mint.to_account_info(),
        to: ctx.accounts.client_token_account.to_account_info(),
        authority: ctx.accounts.vault_token_account.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.key();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

    token_interface::transfer_checked(cpi_ctx, escrow.amount, ctx.accounts.token_mint.decimals)?;

    // change status
    escrow.status = EscrowStatus::Cancelled;

    Ok(())
}
