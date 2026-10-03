use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub client: Pubkey,            // who pays (32 bytes)
    pub developer: Option<Pubkey>, // who got paid, set on release (33 bytes)
    pub verifier: Pubkey,          // who can confirm the payout (32 bytes)
    pub token_mint: Pubkey,        // which token (32 bytes)
    pub amount: u64,               // how much (8 bytes)
    pub status: EscrowStatus,      // current status (1 byte)
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum EscrowStatus {
    Funded,
    Released,
    Cancelled,
}
