use anchor_lang::prelude::*;

#[error_code]
pub enum EscrowErrorCode {
    #[msg("Unauthorized verifier.")]
    UnauthorizedVerifier,
    #[msg("Invalid client account.")]
    InvalidClient,
    #[msg("Escrow has already been processed.")]
    AlreadyProcessed,
    #[msg("Amount must be greater than zero.")]
    InvalidAmount,
}
