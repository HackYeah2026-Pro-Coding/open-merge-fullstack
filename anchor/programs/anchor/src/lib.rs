pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("9MN1vjVWQpePTmrY7nzMBu5ZeGDtQtCbQvWamJWTDMV3");

#[program]
pub mod open_source_project {
    use super::*;

    pub fn create_and_deposit(ctx: Context<CreateAndDeposit>, amount: u64) -> Result<()> {
        create_and_deposit::handle_create_and_deposit(ctx, amount)
    }

    pub fn release(ctx: Context<Release>) -> Result<()> {
        release::handle_release(ctx)
    }

    pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
        cancel::handle_cancel(ctx)
    }
}
