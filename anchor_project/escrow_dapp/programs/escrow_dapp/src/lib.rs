#![allow(deprecated)]

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("B8zkr7q9e5vJxmGdFTbMzY91e48qnucsPArvsVp3GjLJ");

#[program]
pub mod escrow_dapp {
    use super::*;

    /// Initialize a new escrow with specified terms
    pub fn initialize_escrow(
        ctx: Context<InitializeEscrow>,
        initializer_amount: u64,
        taker_amount: u64,
        seed: u64,
    ) -> Result<()> {
        require!(initializer_amount > 0, EscrowError::InvalidAmount);
        require!(taker_amount > 0, EscrowError::InvalidAmount);

        let escrow = &mut ctx.accounts.escrow;
        escrow.initializer = ctx.accounts.initializer.key();
        escrow.initializer_token_account = ctx.accounts.initializer_deposit_token_account.key();
        escrow.expected_taker_amount = taker_amount;
        escrow.seed = seed;
        escrow.is_completed = false;
        escrow.created_at = Clock::get()?.unix_timestamp;
        escrow.bump = ctx.bumps.escrow;

        // Transfer tokens from initializer to escrow vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.initializer_deposit_token_account.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.initializer.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, initializer_amount)?;

        msg!("Escrow initialized - deposited: {}, expecting: {}", initializer_amount, taker_amount);
        Ok(())
    }

    /// Cancel the escrow and return tokens to initializer
    pub fn cancel_escrow(ctx: Context<CancelEscrow>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(!escrow.is_completed, EscrowError::EscrowAlreadyCompleted);

        let amount = ctx.accounts.vault_token_account.amount;

        // Transfer tokens back to initializer
        let seeds = &[
            b"escrow",
            escrow.initializer.as_ref(),
            &escrow.seed.to_le_bytes(),
            &[escrow.bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault_token_account.to_account_info(),
            to: ctx.accounts.initializer_deposit_token_account.to_account_info(),
            authority: ctx.accounts.escrow.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, amount)?;

        msg!("Escrow cancelled and tokens returned");
        Ok(())
    }

    /// Complete the escrow by exchanging tokens
    pub fn exchange(
        ctx: Context<Exchange>,
    ) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(!escrow.is_completed, EscrowError::EscrowAlreadyCompleted);

        let vault_amount = ctx.accounts.vault_token_account.amount;
        let expected_taker_amount = escrow.expected_taker_amount;

        // Transfer tokens from vault to taker
        let seeds = &[
            b"escrow",
            escrow.initializer.as_ref(),
            &escrow.seed.to_le_bytes(),
            &[escrow.bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault_token_account.to_account_info(),
            to: ctx.accounts.taker_receive_token_account.to_account_info(),
            authority: ctx.accounts.escrow.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, vault_amount)?;

        // Transfer tokens from taker to initializer
        let cpi_accounts = Transfer {
            from: ctx.accounts.taker_deposit_token_account.to_account_info(),
            to: ctx.accounts.initializer_receive_token_account.to_account_info(),
            authority: ctx.accounts.taker.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, expected_taker_amount)?;

        ctx.accounts.escrow.is_completed = true;

        msg!("Escrow exchange completed successfully");
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(initializer_amount: u64, taker_amount: u64, seed: u64)]
pub struct InitializeEscrow<'info> {
    #[account(mut)]
    pub initializer: Signer<'info>,

    #[account(
        init,
        payer = initializer,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [b"escrow", initializer.key().as_ref(), &seed.to_le_bytes()],
        bump
    )]
    pub escrow: Account<'info, Escrow>,

    /// CHECK: This is not dangerous because we don't read or write from this account
    pub mint: AccountInfo<'info>,

    #[account(
        mut,
        constraint = initializer_deposit_token_account.mint == mint.key()
    )]
    pub initializer_deposit_token_account: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = initializer,
        token::mint = mint,
        token::authority = escrow,
        seeds = [b"vault", escrow.key().as_ref()],
        bump
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelEscrow<'info> {
    #[account(mut)]
    pub initializer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"escrow", initializer.key().as_ref(), &escrow.seed.to_le_bytes()],
        bump = escrow.bump,
        has_one = initializer,
        close = initializer
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(mut)]
    pub initializer_deposit_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"vault", escrow.key().as_ref()],
        bump
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Exchange<'info> {
    #[account(mut)]
    pub taker: Signer<'info>,

    #[account(mut)]
    pub taker_deposit_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub taker_receive_token_account: Account<'info, TokenAccount>,

    /// CHECK: This is the initializer account
    #[account(mut)]
    pub initializer: AccountInfo<'info>,

    #[account(mut)]
    pub initializer_receive_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"escrow", initializer.key().as_ref(), &escrow.seed.to_le_bytes()],
        bump = escrow.bump,
        has_one = initializer,
        close = initializer
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        mut,
        seeds = [b"vault", escrow.key().as_ref()],
        bump
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub initializer: Pubkey,
    pub initializer_token_account: Pubkey,
    pub expected_taker_amount: u64,
    pub seed: u64,
    pub is_completed: bool,
    pub created_at: i64,
    pub bump: u8,
}

#[error_code]
pub enum EscrowError {
    #[msg("Amount must be greater than 0")]
    InvalidAmount,
    #[msg("Escrow has already been completed")]
    EscrowAlreadyCompleted,
}
