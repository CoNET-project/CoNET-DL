import { Keypair, Connection, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction, ComputeBudgetProgram, PublicKey, SYSVAR_RENT_PUBKEY} from '@solana/web3.js'
import nacl from 'tweetnacl'
import { decodeUTF8 } from 'tweetnacl-util'
import Bs58 from 'bs58'
import * as Bip39 from "bip39"
import {ethers} from 'ethers'
import {inspect} from 'node:util'
import {
    Address, getProgramDerivedAddress,
    airdropFactory,
    appendTransactionMessageInstructions,
    createSolanaRpc,
    createSolanaRpcSubscriptions,
    createTransactionMessage,
    generateKeyPairSigner,
    getSignatureFromTransaction,
    lamports,
    pipe,
    sendAndConfirmTransactionFactory,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    signTransactionMessageWithSigners,
    getAddressEncoder
} from "@solana/kit"

import { getCreateAccountInstruction, getTransferSolInstruction } from "@solana-program/system";

import {
    getInitializeMintInstruction,
    getMintSize,
    TOKEN_2022_PROGRAM_ADDRESS,
    
} from "@solana-program/token-2022"

import {
  AnchorProvider,
  Program,
  BN,
  web3,
  Wallet,
  setProvider,
  utils
} from "@coral-xyz/anchor"

import {
    createInitializeMintInstruction,
    TOKEN_2022_PROGRAM_ID,
    MINT_SIZE,
    getMinimumBalanceForRentExemptMint,
    getMinimumBalanceForRentExemptAccount,
    ACCOUNT_SIZE,
    createInitializeAccountInstruction,
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountInstruction,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createMintToInstruction,
    createTransferInstruction,
    getAssociatedTokenAddress,
    getOrCreateAssociatedTokenAccount,
    getAccount,
    createMint,
    mintTo,
    transfer,
    TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import { logger } from '../util/util'

import anchor_linear_vesting_del from './anchor_linear_vesting.json'
import {AnchorLinearVesting} from './anchor_linear_vesting'

const programAddress = "11111111111111111111111111111111" as Address


const SignTest = () => {
    // Generate a keypair (replace with your actual keypair)
    const keypair = Keypair.generate()
    const publicKey = keypair.publicKey

    // Message to be signed
    const message = 'This is a test message'
    const encodedMessage = new TextEncoder().encode(message)

    // Sign the message
    const _signature = nacl.sign.detached(encodedMessage, keypair.secretKey)
    const encodedSignature = Bs58.encode(_signature)

    const signature = Bs58.decode(encodedSignature)

    // Verify the signature
    const isValid = nacl.sign.detached.verify(encodedMessage, signature, publicKey.toBytes());

    console.log('Message:', message);
    console.log('Public Key:', publicKey.toBase58());
    console.log('Signature:', encodedSignature);
    console.log('Is valid signature:', isValid);
}

const accountTest = async () => {
    const seeds = ["helloWorld"];
    const [pda, bump] = await getProgramDerivedAddress({
        programAddress,
        seeds
    })

    console.log(`PDA: ${pda}`)
    console.log(`Bump: ${bump}`)
}

const accountDataTest = async () => {


    // Create a connection to Solana cluster
    const rpc = createSolanaRpc("http://localhost:8899");
    const rpcSubscriptions = createSolanaRpcSubscriptions("ws://localhost:8900");

    // Generate a new keypair
    const keypair = await generateKeyPairSigner()
    console.log(`Public Key: ${keypair.address}`)

    // Funding an address with SOL automatically creates an account
    const signature = await airdropFactory({ rpc, rpcSubscriptions })({
        recipientAddress: keypair.address,
        lamports: lamports(1_000_000_000n),
        commitment: "confirmed"
    });

    const accountInfo = await rpc.getAccountInfo(keypair.address).send();
    console.log(accountInfo);
}

const programAccount = async () => {
    const rpc = createSolanaRpc("http://127.0.0.1:8899")
    const rpcSubscriptions = createSolanaRpcSubscriptions("ws://localhost:8900")

    // Generate keypairs for fee payer
    const feePayer = await generateKeyPairSigner()

    // Fund fee payer
    await airdropFactory({ rpc, rpcSubscriptions })({
        recipientAddress: feePayer.address,
        lamports: lamports(1_000_000_000n),
        commitment: "confirmed"
    })

    // Generate keypair to use as address of mint
    const mint = await generateKeyPairSigner()

    // Get default mint account size (in bytes), no extensions enabled
    const space = BigInt(getMintSize())

    // Get minimum balance for rent exemption
    const rent = await rpc.getMinimumBalanceForRentExemption(space).send()

    // Instruction to create new account for mint (token 2022 program)
    // Invokes the system program
    const createAccountInstruction = getCreateAccountInstruction({
        payer: feePayer,
        newAccount: mint,
        lamports: rent,
        space,
        programAddress: TOKEN_2022_PROGRAM_ADDRESS
    })

    // Instruction to initialize mint account data
    // Invokes the token 2022 program
    const initializeMintInstruction = getInitializeMintInstruction({
        mint: mint.address,
        decimals: 9,
        mintAuthority: feePayer.address
    })

    const instructions = [createAccountInstruction, initializeMintInstruction]

    // Get latest blockhash to include in transaction
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send()

    // Create transaction message
    const transactionMessage = pipe(
        createTransactionMessage({ version: 0 }), // Create transaction message
        (tx) => setTransactionMessageFeePayerSigner(feePayer, tx), // Set fee payer
        (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx), // Set transaction blockhash
        (tx) => appendTransactionMessageInstructions(instructions, tx) // Append instructions
    )

    // Sign transaction message with required signers (fee payer and mint keypair)
    const signedTransaction =
        await signTransactionMessageWithSigners(transactionMessage)

    // Send and confirm transaction
    await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(
        signedTransaction,
        { commitment: "confirmed" }
    )

    // Get transaction signature
    const transactionSignature = getSignatureFromTransaction(signedTransaction);

    console.log("Mint Address:", mint.address)
    console.log("Transaction Signature:", transactionSignature)

    const accountInfo = await rpc.getAccountInfo(mint.address).send()
    console.log(accountInfo)
}

const transfer1 = async () => {

    // Create a connection to cluster
    const rpc = createSolanaRpc("http://localhost:8899")
    const rpcSubscriptions = createSolanaRpcSubscriptions("ws://localhost:8900")

    // Generate sender and recipient keypairs
    const sender = await generateKeyPairSigner()
    const recipient = await generateKeyPairSigner()

    const LAMPORTS_PER_SOL = 1_000_000_000n
    const transferAmount = lamports(LAMPORTS_PER_SOL / 100n); // 0.01 SOL

    // Fund sender with airdrop
    await airdropFactory({ rpc, rpcSubscriptions })({
        recipientAddress: sender.address,
        lamports: lamports(LAMPORTS_PER_SOL), // 1 SOL
        commitment: "confirmed"
    })

    // Check balance before transfer
    const { value: preBalance1 } = await rpc.getBalance(sender.address).send()
    const { value: preBalance2 } = await rpc.getBalance(recipient.address).send()

    // Create a transfer instruction for transferring SOL from sender to recipient
    const transferInstruction = getTransferSolInstruction({
        source: sender,
        destination: recipient.address,
        amount: transferAmount // 0.01 SOL in lamports
    })

    // Add the transfer instruction to a new transaction
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send()
    const transactionMessage = pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageFeePayerSigner(sender, tx),
        (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
        (tx) => appendTransactionMessageInstructions([transferInstruction], tx)
    )

    // Send the transaction to the network
    const signedTransaction =
        await signTransactionMessageWithSigners(transactionMessage)

    await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(
        signedTransaction,
        { commitment: "confirmed" }
    )

    const transactionSignature = getSignatureFromTransaction(signedTransaction)

    // Check balance after transfer
    const { value: postBalance1 } = await rpc.getBalance(sender.address).send()
    const { value: postBalance2 } = await rpc.getBalance(recipient.address).send()

    console.log(
        "Sender prebalance:",
        Number(preBalance1) / Number(LAMPORTS_PER_SOL)
    );
    console.log(
        "Recipient prebalance:",
        Number(preBalance2) / Number(LAMPORTS_PER_SOL)
    );
    console.log(
        "Sender postbalance:",
        Number(postBalance1) / Number(LAMPORTS_PER_SOL)
    );
    console.log(
        "Recipient postbalance:",
        Number(postBalance2) / Number(LAMPORTS_PER_SOL)
    );
    console.log("Transaction Signature:", transactionSignature)
}

const transfer2 = async () => {
    const connection = new Connection("http://localhost:8899", "confirmed");
    const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();

    // Generate sender and recipient keypairs
    const sender = Keypair.generate();
    const recipient = new Keypair();

    // Define the amount to transfer
    const transferAmount = 0.01; // 0.01 SOL

    // Create a transfer instruction for transferring SOL from sender to recipient
    const transferInstruction = SystemProgram.transfer({
        fromPubkey: sender.publicKey,
        toPubkey: recipient.publicKey,
        lamports: transferAmount * LAMPORTS_PER_SOL // Convert transferAmount to lamports
    });

    const transaction = new Transaction({
        blockhash,
        lastValidBlockHeight,
        feePayer: sender.publicKey
    }).add(transferInstruction)

    const tx = transaction.sign(sender)
    console.log(tx)
    const compiledMessage = transaction.compileMessage()
    console.log(JSON.stringify(compiledMessage, null, 2))
}
// const connection = new Connection("http://localhost:8899", "confirmed")
const rpc = 'https://api.devnet.solana.com'
const connection = new Connection(rpc, "confirmed")


const transfer3 = async () => {
    const sender = Keypair.generate()
    const recipient = new Keypair()

    const airdropSignature = await connection.requestAirdrop(
        sender.publicKey,
        LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(airdropSignature, "confirmed")

    // Create compute budget instructions
    const limitInstruction = ComputeBudgetProgram.setComputeUnitLimit({
        units: 300_000
    })
    const priceInstruction = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 1
    })

    const transferInstruction = SystemProgram.transfer({
        fromPubkey: sender.publicKey,
        toPubkey: recipient.publicKey,
        lamports: 0.01 * LAMPORTS_PER_SOL
    })

    // Add the compute budget and transfer instructions to a new transaction
    const transaction = new Transaction()
        .add(limitInstruction)
        .add(priceInstruction)
        .add(transferInstruction)

    const signature = await sendAndConfirmTransaction(connection, transaction, [
        sender
    ])

    console.log("Transaction Signature:", signature)
}

const PDAtest1 = async () => {

    

    const seeds = ["helloWorld"];
    const [pda, bump] = await getProgramDerivedAddress({
        programAddress,
        seeds
    })

    console.log(`PDA: ${pda}`);
    console.log(`Bump: ${bump}`);
}

const PDATest2 = async () => {
    const addressEncoder = getAddressEncoder()
    const optionalSeedAddress = addressEncoder.encode(
     "B9Lf9z5BfNPT4d5KMeaBFx8x1G4CULZYR1jA2kmxRDka" as Address
    )
    const seeds = [optionalSeedAddress]
    const [pda, bump] = await getProgramDerivedAddress({
        programAddress,
        seeds
    });

    console.log(`PDA: ${pda}`);
    console.log(`Bump: ${bump}`);
}

const token1 = async () => {
// Create connection to local validator
    const connection = new Connection("http://127.0.0.1:8899", "confirmed")
    const recentBlockhash = await connection.getLatestBlockhash()

    // Generate a new keypair for the fee payer
    const feePayer = Keypair.generate()

    // Airdrop 1 SOL to fee payer
    const airdropSignature = await connection.requestAirdrop(
        feePayer.publicKey,
        LAMPORTS_PER_SOL
    )

    await connection.confirmTransaction({
        blockhash: recentBlockhash.blockhash,
        lastValidBlockHeight: recentBlockhash.lastValidBlockHeight,
        signature: airdropSignature
    })

    // Generate keypair to use as address of mint
    const mint = Keypair.generate()

    const createAccountInstruction = SystemProgram.createAccount({
        fromPubkey: feePayer.publicKey,
        newAccountPubkey: mint.publicKey,
        space: MINT_SIZE,
        lamports: await getMinimumBalanceForRentExemptMint(connection),
        programId: TOKEN_2022_PROGRAM_ID
    })

    const initializeMintInstruction = createInitializeMintInstruction(
        mint.publicKey, // mint pubkey
        6, // decimals
        feePayer.publicKey, // mint authority
        feePayer.publicKey, // freeze authority
        TOKEN_2022_PROGRAM_ID
    );

    const transaction = new Transaction().add(
        createAccountInstruction,
        initializeMintInstruction
    )

    const transactionSignature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [feePayer, mint] // Signers
    )

    console.log("Mint Address: ", mint.publicKey.toBase58())
    console.log("Transaction Signature: ", transactionSignature)
}


const token2 = async () => {

    const recentBlockhash = await connection.getLatestBlockhash()
    // Generate a new keypair for the fee payer
    const feePayer = Keypair.generate();

    // Airdrop 1 SOL to fee payer
    const airdropSignature = await connection.requestAirdrop(
        feePayer.publicKey,
        LAMPORTS_PER_SOL
    )

    await connection.confirmTransaction({
        blockhash: recentBlockhash.blockhash,
        lastValidBlockHeight: recentBlockhash.lastValidBlockHeight,
        signature: airdropSignature
    })

    // Generate keypair to use as address of mint
    const mint = Keypair.generate()

    // Get minimum balance for rent exemption
    const mintRent = await getMinimumBalanceForRentExemptMint(connection)

    // Create account instruction
    const createAccountInstruction = SystemProgram.createAccount({
        fromPubkey: feePayer.publicKey,
        newAccountPubkey: mint.publicKey,
        space: MINT_SIZE,
        lamports: mintRent,
        programId: TOKEN_2022_PROGRAM_ID
    })

    // Initialize mint instruction
    const initializeMintInstruction = createInitializeMintInstruction(
        mint.publicKey, // mint pubkey
        2, // decimals
        feePayer.publicKey, // mint authority
        feePayer.publicKey, // freeze authority
        TOKEN_2022_PROGRAM_ID
    )

    // Create and sign transaction
    let transaction = new Transaction({
        feePayer: feePayer.publicKey,
        blockhash: recentBlockhash.blockhash,
        lastValidBlockHeight: recentBlockhash.lastValidBlockHeight
    }).add(createAccountInstruction, initializeMintInstruction)

    // Sign transaction
    const transactionSignature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [feePayer, mint]
    )

    console.log("Mint Address:", mint.publicKey.toBase58())
    console.log("Transaction Signature:", transactionSignature)

    // Generate keypair to use as address of token account
    const tokenAccount = Keypair.generate()

    // Get minimum balance for rent exemption for token account
    const tokenAccountRent = await getMinimumBalanceForRentExemptAccount(connection)

    // Create token account instruction
    const createTokenAccountInstruction = SystemProgram.createAccount({
        fromPubkey: feePayer.publicKey,
        newAccountPubkey: tokenAccount.publicKey,
        space: ACCOUNT_SIZE,
        lamports: tokenAccountRent,
        programId: TOKEN_2022_PROGRAM_ID
    })

    // Initialize token account instruction
    const initializeTokenAccountInstruction = createInitializeAccountInstruction(
        tokenAccount.publicKey, // token account
        mint.publicKey, // mint
        feePayer.publicKey, // owner
        TOKEN_2022_PROGRAM_ID
    )

    // Create and sign transaction for token account
    let tokenAccountTransaction = new Transaction({
        feePayer: feePayer.publicKey,
        blockhash: recentBlockhash.blockhash,
        lastValidBlockHeight: recentBlockhash.lastValidBlockHeight
    }).add(createTokenAccountInstruction, initializeTokenAccountInstruction)

    // Sign and send transaction
    const tokenAccountTxSignature = await sendAndConfirmTransaction(
        connection,
        tokenAccountTransaction,
        [feePayer, tokenAccount]
    );

    console.log("Token Account Address:", tokenAccount.publicKey.toBase58())
    console.log("Transaction Signature:", tokenAccountTxSignature)
}

const token3 = async () => {
    // Generate a new keypair for the fee payer
    const feePayer = Keypair.generate()
    const recentBlockhash = await connection.getLatestBlockhash()

    // Airdrop 1 SOL to fee payer
    const airdropSignature = await connection.requestAirdrop(
        feePayer.publicKey,
        LAMPORTS_PER_SOL
    )

    await connection.confirmTransaction({
        blockhash: recentBlockhash.blockhash,
        lastValidBlockHeight: recentBlockhash.lastValidBlockHeight,
        signature: airdropSignature
    })

    // Generate keypair to use as address of mint
    const mint = Keypair.generate()

    // Get minimum balance for rent exemption
    const mintRent = await getMinimumBalanceForRentExemptMint(connection)

    // Get the associated token account address
    const associatedTokenAccount = getAssociatedTokenAddressSync(
        mint.publicKey,
        feePayer.publicKey,
        false, // allowOwnerOffCurve
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    )

    // Create account instruction
    const createAccountInstruction = SystemProgram.createAccount({
        fromPubkey: feePayer.publicKey,
        newAccountPubkey: mint.publicKey,
        space: MINT_SIZE,
        lamports: mintRent,
        programId: TOKEN_2022_PROGRAM_ID
    })

    // Initialize mint instruction
    const initializeMintInstruction = createInitializeMintInstruction(
        mint.publicKey, // mint pubkey
        2, // decimals
        feePayer.publicKey, // mint authority
        feePayer.publicKey, // freeze authority
        TOKEN_2022_PROGRAM_ID
    );

    // Create associated token account instruction
    const createAssociatedTokenAccountIx = createAssociatedTokenAccountInstruction(
        feePayer.publicKey, // payer
        associatedTokenAccount, // associated token account address
        feePayer.publicKey, // owner
        mint.publicKey, // mint
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // Create and sign transaction with both mint creation and ATA creation
    const transaction = new Transaction({
        feePayer: feePayer.publicKey,
        blockhash: recentBlockhash.blockhash,
        lastValidBlockHeight: recentBlockhash.lastValidBlockHeight
    }).add(
        createAccountInstruction,
        initializeMintInstruction,
        createAssociatedTokenAccountIx
    )

    // Sign transaction
    const transactionSignature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [feePayer, mint]
    )

    console.log("Mint Address:", mint.publicKey.toBase58())
    console.log(
        "Associated Token Account Address:",
        associatedTokenAccount.toBase58()
    )
    console.log("Transaction Signature:", transactionSignature)

    // Create a separate transaction for minting tokens
    // Create mint to instruction (mint 100 tokens = 1.00 with 2 decimals)
    const mintAmount = 100;
    const mintToInstruction = createMintToInstruction(
        mint.publicKey, // mint
        associatedTokenAccount, // destination
        feePayer.publicKey, // authority
        mintAmount, // amount
        [], // multiSigners
        TOKEN_2022_PROGRAM_ID // programId
    )

    // Get a new blockhash for the mint transaction
    const mintBlockhash = await connection.getLatestBlockhash()

    // Create and sign transaction for minting tokens
    const mintTransaction = new Transaction({
        feePayer: feePayer.publicKey,
        blockhash: mintBlockhash.blockhash,
        lastValidBlockHeight: mintBlockhash.lastValidBlockHeight
    }).add(mintToInstruction)

    // Sign and send mint transaction
    const mintTransactionSignature = await sendAndConfirmTransaction(
        connection,
        mintTransaction,
        [feePayer]
    )

    console.log("Transaction Signature:", mintTransactionSignature)
}

const createKeyHDWallets = (secretPhrase: string | null) => {
  try {
    if (!secretPhrase) return ethers.Wallet.createRandom()
    return ethers.Wallet.fromPhrase(secretPhrase);
  } catch (ex) {
    return null
  }
}

const initSolana = async (mnemonic: string): Promise<{publicKey: string, privateKey: string}|false> => {
	if (!Bip39.validateMnemonic(mnemonic)) return false;

	const seed = (await Bip39.mnemonicToSeed(mnemonic)).slice(0, 32)
	const keypair = Keypair.fromSeed(new Uint8Array(seed));

	return {
	  publicKey: keypair.publicKey.toBase58(),
	  privateKey: Bs58.encode(keypair.secretKey),
	}
}



const token4 = async () => {
    const recentBlockhash = await connection.getLatestBlockhash()

    // Generate a new keypair for the fee payer
    const feePayer = Keypair.generate()

    // Generate a new keypair for the recipient
    const recipient = Keypair.generate()

    // Airdrop 1 SOL to fee payer
    const airdropSignature = await connection.requestAirdrop(
        feePayer.publicKey,
        LAMPORTS_PER_SOL
    )

    await connection.confirmTransaction({
        blockhash: recentBlockhash.blockhash,
        lastValidBlockHeight: recentBlockhash.lastValidBlockHeight,
        signature: airdropSignature
    })

    // Airdrop 0.1 SOL to recipient for rent exemption
    const recipientAirdropSignature = await connection.requestAirdrop(
        recipient.publicKey,
        LAMPORTS_PER_SOL / 10
    )

    await connection.confirmTransaction({
        blockhash: recentBlockhash.blockhash,
        lastValidBlockHeight: recentBlockhash.lastValidBlockHeight,
        signature: recipientAirdropSignature
    })

    // Generate keypair to use as address of mint
    const mint = Keypair.generate()

    // Get minimum balance for rent exemption
    const mintRent = await getMinimumBalanceForRentExemptMint(connection)

    // Get the associated token account address for the fee payer
    const feePayerATA = getAssociatedTokenAddressSync(
        mint.publicKey,
        feePayer.publicKey,
        false, // allowOwnerOffCurve
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    )

    // Get the associated token account address for the recipient
    const recipientATA = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipient.publicKey,
        false, // allowOwnerOffCurve
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    )

    // Create account instruction
    const createAccountInstruction = SystemProgram.createAccount({
        fromPubkey: feePayer.publicKey,
        newAccountPubkey: mint.publicKey,
        space: MINT_SIZE,
        lamports: mintRent,
        programId: TOKEN_2022_PROGRAM_ID
    })

    // Initialize mint instruction
    const initializeMintInstruction = createInitializeMintInstruction(
        mint.publicKey, // mint pubkey
        2, // decimals
        feePayer.publicKey, // mint authority
        feePayer.publicKey, // freeze authority
        TOKEN_2022_PROGRAM_ID
    )

    // Create associated token account instruction for fee payer
    const createSenderATA = createAssociatedTokenAccountInstruction(
        feePayer.publicKey, // payer
        feePayerATA, // associated token account address
        feePayer.publicKey, // owner
        mint.publicKey, // mint
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    )

    // Create recipient's associated token account
    const createRecipientATA = createAssociatedTokenAccountInstruction(
        feePayer.publicKey, // payer
        recipientATA, // associated token account address
        recipient.publicKey, // owner
        mint.publicKey, // mint
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    )

    // Create a separate transaction for minting tokens
    // Create mint to instruction (mint 100 tokens = 1.00 with 2 decimals)
    const mintAmount = 10000
    const mintToInstruction = createMintToInstruction(
        mint.publicKey, // mint
        feePayerATA, // destination
        feePayer.publicKey, // authority
        mintAmount, // amount
        [], // multiSigners
        TOKEN_2022_PROGRAM_ID // programId
    );

    // Create and sign transaction with mint creation and fee payer ATA creation
    const transaction = new Transaction({
        feePayer: feePayer.publicKey,
        blockhash: recentBlockhash.blockhash,
        lastValidBlockHeight: recentBlockhash.lastValidBlockHeight
        }).add(
        createAccountInstruction,
        initializeMintInstruction,
        createSenderATA,
        createRecipientATA,
        mintToInstruction
    )

    // Sign transaction
    const transactionSignature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [feePayer, mint]
    );

    console.log("Transaction Signature:", transactionSignature);

    // Create transfer instruction (transfer 50 tokens = 0.50 with 2 decimals)
    const transferAmount = 50
    const transferInstruction = createTransferInstruction(
        feePayerATA, // source
        recipientATA, // destination
        feePayer.publicKey, // owner
        transferAmount, // amount
        [], // multiSigners
        TOKEN_2022_PROGRAM_ID // programId
    );

    // Get a new blockhash for the transfer transaction
    const transferBlockhash = await connection.getLatestBlockhash()

    // Create transaction for token transfer
    let transferTransaction = new Transaction({
        feePayer: feePayer.publicKey,
        blockhash: transferBlockhash.blockhash,
        lastValidBlockHeight: transferBlockhash.lastValidBlockHeight
    }).add(transferInstruction)

    // Sign and send transfer transaction
    const transferSignature = await sendAndConfirmTransaction(
        connection,
        transferTransaction,
        [feePayer]
    );

    console.log(`Successfully transferred 0.50 tokens from sender to recipient`);
    console.log("Transaction Signature:", transferSignature);
}

const CreateToken = async (feePayer: Keypair, recipient: Keypair) => {
    const recentBlockhash = await connection.getLatestBlockhash()


    // Generate keypair to use as address of mint
    const mint = Keypair.generate()
    logger(`mint account = ${mint.publicKey}`)

    // Get minimum balance for rent exemption
    const mintRent = await getMinimumBalanceForRentExemptMint(connection)

    // Get the associated token account address for the fee payer
    const feePayerATA = getAssociatedTokenAddressSync(
        mint.publicKey,
        feePayer.publicKey,
        false, // allowOwnerOffCurve
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    )

    // Get the associated token account address for the recipient
    const recipientATA = getAssociatedTokenAddressSync(
        mint.publicKey,
        recipient.publicKey,
        false, // allowOwnerOffCurve
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    )

    // Create account instruction
    const createAccountInstruction = SystemProgram.createAccount({
        fromPubkey: feePayer.publicKey,
        newAccountPubkey: mint.publicKey,
        space: MINT_SIZE,
        lamports: mintRent,
        programId: TOKEN_2022_PROGRAM_ID
    })

    // Initialize mint instruction
    const initializeMintInstruction = createInitializeMintInstruction(
        mint.publicKey, // mint pubkey
        tokenDecimals, // decimals
        feePayer.publicKey, // mint authority
        feePayer.publicKey, // freeze authority
        TOKEN_2022_PROGRAM_ID
    )

    // Create associated token account instruction for fee payer
    const createSenderATA = createAssociatedTokenAccountInstruction(
        feePayer.publicKey, // payer
        feePayerATA, // associated token account address
        feePayer.publicKey, // owner
        mint.publicKey, // mint
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    )

    // Create recipient's associated token account
    const createRecipientATA = createAssociatedTokenAccountInstruction(
        feePayer.publicKey, // payer
        recipientATA, // associated token account address
        recipient.publicKey, // owner
        mint.publicKey, // mint
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    )

    // Create a separate transaction for minting tokens
    // Create mint to instruction (mint 100 tokens = 1.00 with 2 decimals)
    const mintAmount = 10000
    const mintToInstruction = createMintToInstruction(
        mint.publicKey, // mint
        feePayerATA, // destination
        feePayer.publicKey, // authority
        mintAmount, // amount
        [], // multiSigners
        TOKEN_2022_PROGRAM_ID // programId
    );

    // Create and sign transaction with mint creation and fee payer ATA creation
    const transaction = new Transaction({
        feePayer: feePayer.publicKey,
        blockhash: recentBlockhash.blockhash,
        lastValidBlockHeight: recentBlockhash.lastValidBlockHeight
        }).add(
            createAccountInstruction,
            initializeMintInstruction,
            createSenderATA,
            createRecipientATA,
            mintToInstruction
        )

    // Sign transaction
    const transactionSignature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [feePayer, mint]
    );

    console.log("Transaction Signature:", transactionSignature);

    // Create transfer instruction (transfer 50 tokens = 0.50 with 2 decimals)
    const transferAmount = 50
    const transferInstruction = createTransferInstruction(
        feePayerATA, // source
        recipientATA, // destination
        feePayer.publicKey, // owner
        transferAmount, // amount
        [], // multiSigners
        TOKEN_2022_PROGRAM_ID // programId
    );

    // Get a new blockhash for the transfer transaction
    const transferBlockhash = await connection.getLatestBlockhash()

    // Create transaction for token transfer
    let transferTransaction = new Transaction({
        feePayer: feePayer.publicKey,
        blockhash: transferBlockhash.blockhash,
        lastValidBlockHeight: transferBlockhash.lastValidBlockHeight
    }).add(transferInstruction)

    // Sign and send transfer transaction
    const transferSignature = await sendAndConfirmTransaction(
        connection,
        transferTransaction,
        [feePayer]
    );

    console.log(`Successfully transferred 0.50 tokens from sender to recipient`);
    console.log("Transaction Signature:", transferSignature);
}



const initWallet = async (phrase: string): Promise<null|Keypair> => {
    if (!phrase) {
        const _phrase = createKeyHDWallets('')
        if (!_phrase?.mnemonic?.phrase) {
            return null
        }
        phrase = _phrase.mnemonic.phrase
        logger(`initWallet new Account phrase = ${phrase}`)
    }

    const wallet1 = await initSolana(phrase)
    if (!wallet1) {
        return null
    }
    const solana_account_privatekey_array = Bs58.decode(wallet1.privateKey)
    const wallet = Keypair.fromSecretKey(solana_account_privatekey_array)
    const lamports = await connection.getBalance(wallet.publicKey)

    const recentBlockhash = await connection.getLatestBlockhash()

    const balance = await getSPLTokenBalance(wallet.publicKey, mintSPLAddr)
    logger(`wallet: ${wallet1.publicKey} success $Sol = ${lamports ? lamports/10 ** 9: '0'} SPL token balance = ${balance}`)
    return wallet
}

const _feePayer = 'sausage nasty interest lazy sugar absent emerge prefer jaguar police bless define'       //          3X6hgs2DkrFwUFxoQYinABnzghYsXrgTEqcctAR14UjS
const _recipient = 'casino poet afford elegant repair stomach bubble trigger bamboo gospel ghost menu'   //             HVi4b1cJoRnuBvMTf5i5cAo8e9gmasq2nYfG12rxSy3D
const _mint = 'hammer federal paddle craft equal cruise state stone lecture pool machine chair'          //             LYGyiHe9equJFSq2xMPPCRbGNKQh6zeqg3QVRvArdgC
const newAccount1 = 'vivid style tonight convince kiwi enhance symbol ski rare race pattern crouch'     //              5rdDu3jqHBvFuJDdr9WUUqi189Fc6dFWZZRZio2RJFpn
const token = 'H1MBa2kBiXwqzLzBX6kGgMHqUxhrrCec5tT8o43NaJp5'
const tokenDecimals = 6
const tokenAddress = new PublicKey(token)
const mintAccount = new PublicKey('H1MBa2kBiXwqzLzBX6kGgMHqUxhrrCec5tT8o43NaJp5')
//logger(inspect(createKeyHDWallets(''), false, 3, true))

const getBalanceTOKEN_2022 = async (walletAddress: PublicKey) => {
    try {
        const ata = await getAssociatedTokenAddressSync(
            mintAccount,
            walletAddress,
            false, // allowOwnerOffCurve
        )
        const accountInfo = await getAccount(
            connection, 
            ata,
            undefined,
            TOKEN_2022_PROGRAM_ID
        )
        const balance = Number(accountInfo.amount) / Math.pow(10, tokenDecimals)
        return balance
    } catch (ex: any) {
        logger(`getBalance Error`, ex)
    }
    return 0

}


const getSPLTokenBalance = async (walletAddress: PublicKey, tokenAddress: string) => {
    const spTokenMintAddress = new PublicKey(tokenAddress)
    const tokenAccountAddress = await getAssociatedTokenAddress(spTokenMintAddress, walletAddress)
    // Fetch the account details
    try {
        const accountInfo = await getAccount(connection, tokenAccountAddress)
        const balance = Number(accountInfo.amount) / Math.pow(10, tokenDecimals)
        return balance
    } catch (ex) {
        logger(`getSPLTokenBalance Error`, ex)
    }
    return 0

}

// const mintSPLAddr = '4ZLaNfQ2UCopS4X3VPJhn98aR8xJP2yfhHEX1ibVt9gJ'      //      local 
const mintSPLAddr = '9Je6Dcu9MGTJHez34fsND4zNd29jBHJKhU1RrEgJsJQu'

const mintSPLToken = async (feePayer: Keypair, recipient: Keypair) => {
    const mint = await createMint(
        connection,
        feePayer,
        feePayer.publicKey, // mint authority
        null,             // freeze authority
        tokenDecimals                 // decimals
    )

    console.log('Mint address:', mint.toBase58())

    const senderTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        feePayer,
        mint,
        feePayer.publicKey
    )

    const recipientTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        feePayer,
        mint,
        recipient.publicKey
    )

    await mintTo(
        connection,
        feePayer,
        mint,
        senderTokenAccount.address,
        feePayer,
        10000 * 10 ** tokenDecimals// amount
    )

    // 5️⃣ Transfer 1 token to recipient
    await transfer(
        connection,
        feePayer,
        senderTokenAccount.address,
        recipientTokenAccount.address,
        feePayer.publicKey,
        1 * 10 ** tokenDecimals// transfer 1 token
    )

}

const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: 9000
})


const sendSPLToken = async (from: Keypair, to: PublicKey, amount: number, _token: string) => {

    const token = new PublicKey(_token)
    const recipientTokenAddress = await getAssociatedTokenAddress(
        token,
        to
    )
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
        units: 200000
    })
    const sourceAccount = await getOrCreateAssociatedTokenAccount(
        connection, 
        from,
        token,
        from.publicKey
    )
        
    const tx = new Transaction().add(modifyComputeUnits).add(addPriorityFee)
    const accountInfo = await connection.getAccountInfo(recipientTokenAddress)
    if (!accountInfo) {
        
        tx.add(
            createAssociatedTokenAccountInstruction(
                from.publicKey,         // payer
                recipientTokenAddress,    // ATA address
                to,          // wallet owner
                token                      // token mint
            )
        )
    }
    const transferInstructionSP = createTransferInstruction(
        sourceAccount.address,
        recipientTokenAddress,
        from.publicKey,
        amount * 10 ** tokenDecimals
    )
    tx.add (transferInstructionSP)
    const transferSignature = await sendAndConfirmTransaction(
        connection,
        tx,
        [from]
    )
    logger(`sendSPLToken ${transferSignature}`)

}


const PROGRAM_ID = new PublicKey(anchor_linear_vesting_del.address)


const transferTokenToPDA = async (userWallet: Keypair, token: string, _amount: number) => {
    const tokenMint = new PublicKey(token)
    // STEP 1: Derive PDA
    const [vestingPda] = await PublicKey.findProgramAddressSync(
        [Buffer.from("vesting"), userWallet.publicKey.toBuffer(), tokenMint.toBuffer()],
        PROGRAM_ID
    )

    logger(vestingPda.toBase58())           //      CoDHyGxQeTxXMoyxDL9KcGGMrT9EV8GzBQ3LUgQTUuRp

    // STEP 2: Get Token Accounts
    const fromTokenAccount = await getAssociatedTokenAddress(
        tokenMint,
        userWallet.publicKey
    )

    const escrowAta = await getAssociatedTokenAddress(
        tokenMint,
        vestingPda,
        true // allow PDA as owner
    )
    const tx = new Transaction()
    const EscrowATA = await connection.getAccountInfo(escrowAta)
    if (!EscrowATA) {
        tx.add(
            createAssociatedTokenAccountInstruction(
                userWallet.publicKey,
                escrowAta,
                vestingPda,
                tokenMint,
                TOKEN_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID
            )
        )
    }

    // STEP 3: Create Transfer Instruction
    const amount = _amount * 10 ** tokenDecimals
    const transferIx = createTransferInstruction(
        fromTokenAccount,
        escrowAta,
        userWallet.publicKey,
        amount,
        [],
        TOKEN_PROGRAM_ID
    )

    tx.add(transferIx)
    const sig = await sendAndConfirmTransaction(connection, tx, [userWallet])

    console.log("✅ Deposit complete. Tx Signature:", sig)
}


const claimPDA = async (userWallet: Keypair, token: string) => {
    const tokenMint = new PublicKey(token)
    const anchorWallet = new Wallet(web3.Keypair.fromSecretKey(userWallet.secretKey))
    const anchorConnection = new web3.Connection(rpc)
    const anchorProvider = new AnchorProvider(anchorConnection, anchorWallet, {
        preflightCommitment: 'confirmed'
    })
    const TOKEN_MINT = new PublicKey(token)
    const program = new Program(anchor_linear_vesting_del as AnchorLinearVesting, anchorProvider)
    const VESTING_ID = 0
    const [vestingPda] = await PublicKey.findProgramAddressSync(
        [
            Buffer.from("vesting"), 
            userWallet.publicKey.toBuffer(), 
            tokenMint.toBuffer(), 
            Uint8Array.of(VESTING_ID)],
        PROGRAM_ID
    )
    // F) Derive the beneficiary’s own ATA for TOKEN_MINT:
    const [beneficiaryAta] = await PublicKey.findProgramAddressSync(
        [
            userWallet.publicKey.toBuffer(),
            TOKEN_PROGRAM_ID.toBuffer(),
            TOKEN_MINT.toBuffer(),
        ],
        ASSOCIATED_TOKEN_PROGRAM_ID
    )
    const [escrowAta] = await PublicKey.findProgramAddressSync(
        [
            vestingPda.toBuffer(),
            TOKEN_PROGRAM_ID.toBuffer(),
            TOKEN_MINT.toBuffer(),
        ], 
        ASSOCIATED_TOKEN_PROGRAM_ID
    )

    await program.methods.claim(
        VESTING_ID // vesting_id (u8)
    ).accounts({
        beneficiary: userWallet.publicKey,
            vestingAccount: vestingPda,
            escrowTokenAccount: escrowAta,
            beneficiaryTokenAccount: beneficiaryAta,
            //@ts-ignore
            tokenProgram: TOKEN_PROGRAM_ID,
            tokenMint: TOKEN_MINT,
    }).rpc()
      
}

const initmPDA30minsWithPay = async (BENEFICIARY: PublicKey, token: string, _amount: number, lockedTmeMin: number, payer: Keypair) => {
    const TOKEN_MINT = new PublicKey(token)
    const TOTAL_AMOUNT_RAW = new BN(_amount* 10 ** tokenDecimals)
    const now = Math.floor(Date.now() / 1000)
    const _startTime = 5            //  mins
    const START_TS = new BN(now + 60 * _startTime) // starts _startTime later
    const duration = 60 * lockedTmeMin  // 
    const DURATION_SEC = new BN(duration)
    const VESTING_ID = 0
    const anchorConnection = new web3.Connection(rpc)
    const anchorWallet = new Wallet(web3.Keypair.fromSecretKey(payer.secretKey))
    const anchorProvider = new AnchorProvider(anchorConnection, anchorWallet,  {
        preflightCommitment: 'confirmed'
    })
   
    // STEP 1: Derive PDA
    const [vestingPda, vestingBump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("vesting"),
      BENEFICIARY.toBuffer(),
      TOKEN_MINT.toBuffer(),
      Uint8Array.of(VESTING_ID),
    ], PROGRAM_ID)

    const INITIALIZER_TOKEN_ACCOUNT = await getAssociatedTokenAddress(
        TOKEN_MINT,
        payer.publicKey
    )
    //      Derive the escrow ATA owned by the PDA:
    const [escrowAta] = await PublicKey.findProgramAddressSync(
        [
            vestingPda.toBuffer(),
            TOKEN_PROGRAM_ID.toBuffer(),
            TOKEN_MINT.toBuffer(),
        ], ASSOCIATED_TOKEN_PROGRAM_ID)

    try {
        const info = await getAccount(connection, escrowAta)
        if (!info.owner.equals(vestingPda)) {
            return false
        }
    } catch (ex) {
        const createEscrowIx = createAssociatedTokenAccountInstruction(
            payer.publicKey,    // payer
            escrowAta,
            vestingPda,         // owner of escrow
            TOKEN_MINT
        )
        
        const txCreate = new web3.Transaction().add(createEscrowIx)
        await anchorProvider.sendAndConfirm(txCreate, [payer])
        logger(`createAssociatedTokenAccountInstruction escrowTokenAccount = ${escrowAta.toBase58()} success!`)
    }
    

    const program = new Program(anchor_linear_vesting_del as AnchorLinearVesting, anchorProvider)
    
    await program.methods.initializeVesting(
        VESTING_ID,         // vesting_id (u8)
        TOTAL_AMOUNT_RAW,   // total_amount (BN)
        START_TS,           // start_time (BN)
        DURATION_SEC,       // release_duration (BN)
    ).accounts({
        initializer: payer.publicKey,
        beneficiary: BENEFICIARY,
        vestingAccount: vestingPda,
        tokenMint: TOKEN_MINT,
        escrowTokenAccount: escrowAta,
        initializerTokenAccount: INITIALIZER_TOKEN_ACCOUNT,
        //@ts-ignore
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
    }).signers([payer])
    .rpc()


}

const getBalanceFromPDA = async (userWallet: Keypair, token: string) => {
    const tokenMint = new PublicKey(token)
    const VESTING_ID = 0
    const [vestingPda] = await PublicKey.findProgramAddressSync(
        [Buffer.from("vesting"), userWallet.publicKey.toBuffer(), tokenMint.toBuffer(), Uint8Array.of(VESTING_ID)],
        PROGRAM_ID
    )
    
    const anchorConnection = new web3.Connection(rpc)
    const anchorWallet = new Wallet(web3.Keypair.fromSecretKey(userWallet.secretKey))
    const anchorProvider = new AnchorProvider(anchorConnection, anchorWallet,  {
        preflightCommitment: 'confirmed'
    })

    const program = new Program(anchor_linear_vesting_del as AnchorLinearVesting, anchorProvider)
    
    // 3. Fetch balance
    try {
        const vestingAccount =  await program.account.vestingAccount.fetch(vestingPda)
        // Fields (all BN):
        //   vestingAccount.startTime
        //   vestingAccount.releaseDuration
        //   vestingAccount.totalAmount
        //   vestingAccount.claimedAmount

        // ───────────── Get “now” timestamp ─────────────
        const latestSlot = await anchorProvider.connection.getSlot()
        const nowTs = await anchorProvider.connection.getBlockTime(latestSlot)
        if (nowTs === null) {
            throw new Error("Failed to fetch block time")
        }

        // ───────────── Convert BN → BigInt/number ─────────────
        const startTime = vestingAccount.startTime.toNumber() // UNIX seconds
        const duration = vestingAccount.releaseDuration.toNumber() // seconds

        // BN → BigInt:
        const totalAmount = BigInt(vestingAccount.totalAmount.toString())
        const claimedAmount = BigInt(vestingAccount.claimedAmount.toString())

        // ───────────── Compute “claimable” ─────────────
        const elapsed = nowTs - startTime
        if (elapsed <= 0) {
            console.log("Nothing has vested yet.")
            console.log("claimable = 0")
            return;
        }

        let vested: bigint;
        if (elapsed >= duration) {
            vested = totalAmount
        } else {
            vested = (totalAmount * BigInt(elapsed)) / BigInt(duration)
        }

        const rawClaimable = vested > claimedAmount ? vested - claimedAmount : 0n

        console.log("─ VestingAccount data ─────────────────")
        console.log("startTime (unix):", new Date(startTime*1000))
        console.log("releaseDuration:", duration, "sec")
        console.log("totalAmount (raw):", ethers.formatUnits(totalAmount, tokenDecimals))
        console.log("claimedAmount (raw):", ethers.formatUnits(claimedAmount, tokenDecimals))
        console.log("Now (unix):", new Date(nowTs*1000))
        console.log("Elapsed (sec):", elapsed)
        console.log("Vested so far (raw):", ethers.formatUnits(vested, tokenDecimals))
        console.log("Claimable now (raw):", ethers.formatUnits(rawClaimable, tokenDecimals))


    
        const uiClaimable = Number(rawClaimable) / 10 ** tokenDecimals
        console.log("Claimable (UI):", uiClaimable)

        //console.log(`${userWallet.publicKey.toBase58()} ✅ Vesting account initialized: ${vestingPda.toBase58()}`,inspect(vestingAccount, false, 3, true), inspect({startTime, duration, totalAmount, claimedAmount}, false, 3, true))



    } catch (ex) {
        logger(`getBalanceFromPDA Error!`)
    }

}

const test = async () => {
    // logger(inspect(createKeyHDWallets(''), false, 3, true))
    const mint = await initWallet(_mint)
    const recipient = await initWallet(_recipient)
    const feePayer = await initWallet(_feePayer)
    const account1 = await initWallet(newAccount1)

    if (!feePayer || !recipient || !mint ||!account1) {
        return
    }
    
    logger(inspect({mint: mint.publicKey.toBase58(), recipient: recipient.publicKey.toBase58(), feePayer: feePayer.publicKey.toBase58(), account1: account1.publicKey.toBase58()}, false, 3, true))
    // await mintSPLToken(feePayer, recipient)

    //sendSPLToken(feePayer, account1.publicKey, 100, mintSPLAddr)
    //  await transferTokenToPDA(account1, mintSPLAddr, 10)
    // transferBalanceFromPDA (account1, mintSPLAddr, 10)
    const time = 30         //mins
    await getBalanceFromPDA(recipient, mintSPLAddr)

    await initmPDA30minsWithPay(recipient.publicKey, mintSPLAddr, 10, time, feePayer)
    // await transferTokenToPDA(account1, mintSPLAddr, 10)

    //await withdrawPDA_all(feePayer, mintSPLAddr)
    //await claimPDA(recipient, mintSPLAddr)
}
test()
