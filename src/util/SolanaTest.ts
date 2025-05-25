import { Connection, Keypair, LAMPORTS_PER_SOL, Transaction } from "@solana/web3.js"
import { createMint, TOKEN_2022_PROGRAM_ID, createAssociatedTokenAccount, mintTo } from "@solana/spl-token"
import Bs58 from 'bs58'
import { masterSetup} from './util'

const solana_account = masterSetup.solana_return_manager
const solana_account_privatekeyArray = Bs58.decode(solana_account)
const solana_account_privatekey = Keypair.fromSecretKey(solana_account_privatekeyArray)
const SP_address = 'Bzr4aEQEXrk7k8mbZffrQ9VzX6V3PAH4LvWKXkKppump'
const decimals = 6
const testMint = async () => {
    // Create connection to local validator
    const SOLANA_CONNECTION = new Connection(
        "https://api.mainnet-beta.solana.com", "confirmed"
    )

    const recentBlockhash = await SOLANA_CONNECTION.getLatestBlockhash()

    const airdropSignature = await SOLANA_CONNECTION.requestAirdrop(
        solana_account_privatekey.publicKey,
        LAMPORTS_PER_SOL
    )

    await SOLANA_CONNECTION.confirmTransaction({
        blockhash: recentBlockhash.blockhash,
        lastValidBlockHeight: recentBlockhash.lastValidBlockHeight,
        signature: airdropSignature
    })

    // Create mint using helper function
    const mintPubkey = await createMint(
        SOLANA_CONNECTION, // connection
        solana_account_privatekey, // fee payer
        solana_account_privatekey.publicKey, // mint authority
        solana_account_privatekey.publicKey, // freeze authority
        decimals, // decimals
        Keypair.generate(), // keypair (optional)
        {
            commitment: "confirmed" // confirmation options
        },
        TOKEN_2022_PROGRAM_ID // program id
    );
    console.log(`Mint Address: ${mintPubkey.toBase58()}`)

    // Create associated token account using helper function
    const associatedTokenAccount = await createAssociatedTokenAccount(
        SOLANA_CONNECTION, // connection
        solana_account_privatekey, // fee payer
        mintPubkey, // mint
        solana_account_privatekey.publicKey, // owner
        {
            commitment: "confirmed" // confirmation options
        },
        TOKEN_2022_PROGRAM_ID // program id
    )
    console.log(`Associated Token Account Address: ${associatedTokenAccount.toBase58()}`)

    // Mint 100 tokens to the associated token account (with 2 decimals, this is 1.00 tokens)
    const mintAmount = 10000 * 10 ** decimals // 1.00 tokens with 2 decimals
    const transactionSignature = await mintTo(
        SOLANA_CONNECTION, // connection
        solana_account_privatekey, // payer
        mintPubkey, // mint
        associatedTokenAccount, // destination
        solana_account_privatekey, // authority (mint authority)
        mintAmount, // amount
        [], // additional signers
        {
            commitment: "confirmed" // confirmation options
        },
        TOKEN_2022_PROGRAM_ID // program id
    )
    console.log(`Successfully minted 1.00 tokens to ${associatedTokenAccount.toBase58()}`)
    console.log(`Transaction Signature: ${transactionSignature}`)
}





// testMint()