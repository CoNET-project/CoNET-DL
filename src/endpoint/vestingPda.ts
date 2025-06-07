import anchor_linear_vesting_del from './anchor_linear_vesting.json'
import {AnchorLinearVesting} from './anchor_linear_vesting'
import {
  AnchorProvider,
  Program,
  BN,
  web3,
  Wallet,
  setProvider,
  utils
} from "@coral-xyz/anchor"
import Bs58 from 'bs58'
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
} from "@solana/spl-token"
import { Keypair, Connection, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction, ComputeBudgetProgram, PublicKey, SYSVAR_RENT_PUBKEY} from '@solana/web3.js'
import {logger} from '../util/logger'
import { masterSetup, checkSign} from '../util/util'
import {ethers} from 'ethers'

const SP_tokenDecimals = 6
const PROGRAM_ID = new web3.PublicKey(anchor_linear_vesting_del.address)

const Time_Min = 60                         //      1 min = 60 seconds
const Time_Hour = 60 * Time_Min             //      1 hour = 60 mins
const Time_Day = 24 * Time_Hour             //      1 Day = 24 hours
const Time_Month = 31 * Time_Day            //      1 month = 31 Days
const Time_year = 12 * Time_Month           //      1 year = 12 Months
const SP_address = 'Bzr4aEQEXrk7k8mbZffrQ9VzX6V3PAH4LvWKXkKppump'
const TOKEN_MINT = new web3.PublicKey(SP_address)
const _payerPrivatekey = masterSetup.SP_Club_Airdrop_solana                         //      5G2CDk6fhtVGQwj42SNbyhW9S33c5zoa2iTKqEJ78bNt
const solana_account_privatekeyArray = Bs58.decode(_payerPrivatekey)
const ManagerKey = web3.Keypair.fromSecretKey(solana_account_privatekeyArray)
const solana_rpc = masterSetup.solana_rpc

const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: 9000
})

export const init_gold_linear_vesting = async (_BENEFICIARY: string, _amount: number, lockedTmeMin: number) => {

    const connection = new Connection(solana_rpc, "confirmed")
    
    const TOTAL_AMOUNT_RAW = new BN(_amount* 10 ** SP_tokenDecimals)
    const BENEFICIARY = new web3.PublicKey(_BENEFICIARY)
    const now = Math.floor(Date.now() / 1000)
    const _startTime = 5 * Time_Min
    const START_TS = new BN(now + _startTime) // starts _startTime later
    const duration = 60 * lockedTmeMin  
    const DURATION_SEC = new BN(duration)
    const VESTING_ID = 0
    const anchorConnection = new web3.Connection(solana_rpc)
    
    
    const anchorWallet = new Wallet(ManagerKey)

    const anchorProvider = new AnchorProvider(anchorConnection, anchorWallet,  {
        preflightCommitment: 'confirmed'
    })
   
    // STEP 1: Derive PDA
    const [vestingPda, vestingBump] = web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("vesting"),
      BENEFICIARY.toBuffer(),
      TOKEN_MINT.toBuffer(),
      Uint8Array.of(VESTING_ID),
    ], PROGRAM_ID)

    const INITIALIZER_TOKEN_ACCOUNT = await getAssociatedTokenAddress(
        TOKEN_MINT,
        ManagerKey.publicKey
    )
    //      Derive the escrow ATA owned by the PDA:
    const [escrowAta] = await web3.PublicKey.findProgramAddressSync([
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
            ManagerKey.publicKey,    // payer
            escrowAta,
            vestingPda,         // owner of escrow
            TOKEN_MINT
        )
        
        const txCreate = new web3.Transaction().add(createEscrowIx)
        await anchorProvider.sendAndConfirm(txCreate, [ManagerKey])
        logger(`init_gold_linear_vesting escrowTokenAccount = ${escrowAta.toBase58()} success!`)
        await new Promise(executor => {setTimeout(() => executor(true), 5000)})

    }
    

    const program = new Program(anchor_linear_vesting_del as AnchorLinearVesting, anchorProvider)
    logger(`init_gold_linear_vesting initializeVesting...`)
    await program.methods.initializeVesting(
        VESTING_ID,         // vesting_id (u8)
        TOTAL_AMOUNT_RAW,   // total_amount (BN)
        START_TS,           // start_time (BN)
        DURATION_SEC,       // release_duration (BN)
    ).accounts({
        initializer: ManagerKey.publicKey,
        beneficiary: BENEFICIARY,
        vestingAccount: vestingPda,
        tokenMint: TOKEN_MINT,
        escrowTokenAccount: escrowAta,
        initializerTokenAccount: INITIALIZER_TOKEN_ACCOUNT,
        //@ts-ignore
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
    }).signers([ManagerKey])
    .rpc()
    logger(`init_gold_linear_vesting success!`)
}

export const getBalanceFromPDA = async (BENEFICIARY: web3.Keypair) => {
    
    const VESTING_ID = 0
       // STEP 1: Derive PDA
    const [vestingPda] = await PublicKey.findProgramAddressSync(
        [Buffer.from("vesting"), BENEFICIARY.publicKey.toBuffer(), TOKEN_MINT.toBuffer(), Uint8Array.of(VESTING_ID)],
        PROGRAM_ID
    )

    const anchorConnection = new web3.Connection(solana_rpc)

    const anchorWallet = new Wallet(BENEFICIARY)
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
        console.log("totalAmount (raw):", ethers.formatUnits(totalAmount, SP_tokenDecimals))
        console.log("claimedAmount (raw):", ethers.formatUnits(claimedAmount, SP_tokenDecimals))
        console.log("Now (unix):", new Date(nowTs*1000))
        console.log("Elapsed (sec):", elapsed)
        console.log("Vested so far (raw):", ethers.formatUnits(vested, SP_tokenDecimals))
        console.log("Claimable now (raw):", ethers.formatUnits(rawClaimable, SP_tokenDecimals))


    
        const uiClaimable = Number(rawClaimable) / 10 ** SP_tokenDecimals
        console.log("Claimable (UI):", uiClaimable)

        //console.log(`${userWallet.publicKey.toBase58()} ✅ Vesting account initialized: ${vestingPda.toBase58()}`,inspect(vestingAccount, false, 3, true), inspect({startTime, duration, totalAmount, claimedAmount}, false, 3, true))



    } catch (ex) {
        logger(`getBalanceFromPDA Error!`)
    }

}

export const claimPDA = async (BENEFICIARY: web3.Keypair) => {
    const anchorWallet = new Wallet(BENEFICIARY)
    const anchorConnection = new web3.Connection(solana_rpc)

    const anchorProvider = new AnchorProvider(anchorConnection, anchorWallet, {
        preflightCommitment: 'confirmed'
    })
    
    const program = new Program(anchor_linear_vesting_del as AnchorLinearVesting, anchorProvider)

    const VESTING_ID = 0
       // STEP 1: Derive PDA

    const [vestingPda, vestingBump] = web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("vesting"),
      BENEFICIARY.publicKey.toBuffer(),
      TOKEN_MINT.toBuffer(),
      Uint8Array.of(VESTING_ID),
    ], PROGRAM_ID)

    const recipientTokenAddress = await getAssociatedTokenAddress(
        TOKEN_MINT,
        BENEFICIARY.publicKey
    )

    const accountInfo = await anchorConnection.getAccountInfo(recipientTokenAddress)
    
    if (!accountInfo) {
        
         
        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
            units: 200000
        })
        const tx = new web3.Transaction().add(modifyComputeUnits).add(addPriorityFee)
        tx.add(
            createAssociatedTokenAccountInstruction(
                BENEFICIARY.publicKey,         // payer
                recipientTokenAddress,      // ATA address
                BENEFICIARY.publicKey,                 // wallet owner
                TOKEN_MINT                      // token mint
            )
        )
        const transactionSignature = await anchorConnection.sendTransaction(tx, [BENEFICIARY])
        logger(`claimPDA have no Account Info creatr ${recipientTokenAddress.toBase58()} ${transactionSignature}`)
         await new Promise(executor => {setTimeout(() => executor(true), 5000)})
    }
    
    // const [beneficiaryAta] = await PublicKey.findProgramAddressSync(
    //     [
    //         BENEFICIARY.publicKey.toBuffer(),
    //         TOKEN_PROGRAM_ID.toBuffer(),
    //         TOKEN_MINT.toBuffer(),
    //     ],
    //     ASSOCIATED_TOKEN_PROGRAM_ID
    // )
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
        beneficiary: BENEFICIARY.publicKey,
        vestingAccount: vestingPda,
        escrowTokenAccount: escrowAta,
        beneficiaryTokenAccount: recipientTokenAddress,
        //@ts-ignore
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenMint: TOKEN_MINT,
    }).rpc()
    logger(`claimPDA success!`)
    
}


const test = async () => {
    const BENEFICIARY_privateKey = ''
    // logger(`Managet key ${ManagerKey.publicKey.toBase58()}`)
    
    const BENEFICIARY_bs58 = Bs58.decode(BENEFICIARY_privateKey)
    const BENEFICIARY = web3.Keypair.fromSecretKey(BENEFICIARY_bs58)
    //init_gold_linear_vesting(BENEFICIARY.publicKey.toBase58(), 60, 180)
    await getBalanceFromPDA (BENEFICIARY)
    //await claimPDA (BENEFICIARY)
}

test()