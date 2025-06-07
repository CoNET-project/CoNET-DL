/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/anchor_linear_vesting.json`.
 */
export type AnchorLinearVesting = {
  "address": "3Ar8n19awwnfkVwnz29NCz3HJDyEeDAwLPa8egsQd1Cs",
  "metadata": {
    "name": "anchorLinearVesting",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "claim",
      "docs": [
        "Claim any newly‐vested tokens. Only the recorded `beneficiary` may call."
      ],
      "discriminator": [
        62,
        198,
        214,
        193,
        213,
        159,
        108,
        210
      ],
      "accounts": [
        {
          "name": "beneficiary",
          "docs": [
            "The beneficiary who will sign to claim tokens."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "vestingAccount",
          "docs": [
            "The vesting PDA, which Anchor verifies was derived using:",
            "[",
            "b\"vesting\",",
            "vesting_account.owner.as_ref(),",
            "vesting_account.token_mint.as_ref(),",
            "&[vesting_id]",
            "]"
          ],
          "writable": true
        },
        {
          "name": "escrowTokenAccount",
          "docs": [
            "The PDA’s escrow token account holding the locked tokens."
          ],
          "writable": true
        },
        {
          "name": "beneficiaryTokenAccount",
          "docs": [
            "The beneficiary’s own token account to receive claimed tokens."
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "tokenMint"
        }
      ],
      "args": [
        {
          "name": "vestingId",
          "type": "u8"
        }
      ]
    },
    {
      "name": "initializeVesting",
      "docs": [
        "Initialize a new vesting schedule.",
        "- `vesting_id` is a small `u8` (0…255) that distinguishes multiple schedules for the same (beneficiary, token_mint).",
        "- The initializer pays rent and must transfer `total_amount` tokens from their own token account into the PDA’s escrow."
      ],
      "discriminator": [
        5,
        29,
        245,
        237,
        50,
        242,
        35,
        13
      ],
      "accounts": [
        {
          "name": "initializer",
          "docs": [
            "The wallet paying rent and providing tokens. Must be a Signer."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "beneficiary"
        },
        {
          "name": "vestingAccount",
          "docs": [
            "The vesting PDA, created by Anchor with these seeds + bump:",
            "[",
            "b\"vesting\",",
            "beneficiary.key().as_ref(),",
            "token_mint.key().as_ref(),",
            "&[vesting_id]",
            "]"
          ],
          "writable": true
        },
        {
          "name": "tokenMint",
          "docs": [
            "The SPL token mint being vested."
          ]
        },
        {
          "name": "escrowTokenAccount",
          "docs": [
            "The token account (ATA or custom) owned by the PDA; holds escrowed tokens."
          ],
          "writable": true
        },
        {
          "name": "initializerTokenAccount",
          "docs": [
            "The initializer’s own token account for this mint (must hold ≥ `total_amount`)."
          ],
          "writable": true
        },
        {
          "name": "systemProgram",
          "docs": [
            "Standard programs & sysvars."
          ],
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "vestingId",
          "type": "u8"
        },
        {
          "name": "totalAmount",
          "type": "u64"
        },
        {
          "name": "startTime",
          "type": "i64"
        },
        {
          "name": "releaseDuration",
          "type": "i64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "vestingAccount",
      "discriminator": [
        102,
        73,
        10,
        233,
        200,
        188,
        228,
        216
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "You are not authorized to claim from this vesting account."
    },
    {
      "code": 6001,
      "name": "invalidVestingId",
      "msg": "The provided vesting_id does not match the PDA’s stored vesting_id."
    },
    {
      "code": 6002,
      "name": "invalidPda",
      "msg": "The PDA did not match the expected seeds (beneficiary, token_mint, vesting_id)."
    }
  ],
  "types": [
    {
      "name": "vestingAccount",
      "docs": [
        "On‐chain data for each vesting PDA."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "tokenMint",
            "type": "pubkey"
          },
          {
            "name": "vestingId",
            "type": "u8"
          },
          {
            "name": "escrowAccount",
            "type": "pubkey"
          },
          {
            "name": "startTime",
            "type": "i64"
          },
          {
            "name": "releaseDuration",
            "type": "i64"
          },
          {
            "name": "totalAmount",
            "type": "u64"
          },
          {
            "name": "claimedAmount",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
