import { inspect } from 'node:util'
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

import { Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction, 
    ComputeBudgetProgram, PublicKey, SYSVAR_RENT_PUBKEY, TransactionInstruction, AddressLookupTableAccount, Connection, TransactionMessage, VersionedTransaction} from '@solana/web3.js'
import {logger} from '../util/logger'
import { masterSetup, checkSign} from '../util/util'
import {ethers} from 'ethers'
import axios from 'axios'

const SP_tokenDecimals = 6
const PROGRAM_ID = new web3.PublicKey(anchor_linear_vesting_del.address)

const Time_Min = 60                         //      1 min = 60 seconds
const Time_Hour = 60 * Time_Min             //      1 hour = 60 mins
const Time_Day = 24 * Time_Hour             //      1 Day = 24 hours
const Time_Month = 31 * Time_Day            //      1 month = 31 Days
const Time_year = 12 * Time_Month           //      1 year = 12 Months
const SP_address = 'Bzr4aEQEXrk7k8mbZffrQ9VzX6V3PAH4LvWKXkKppump'
const TOKEN_MINT = new web3.PublicKey(SP_address)
const _payerPrivatekey = masterSetup.SP_Club_Manager                        //      6fW8wQhYQJTudT2EB14DvKCbe1X9Ewhd16ukT3DQkFX9
const solana_account_privatekeyArray = Bs58.decode(_payerPrivatekey)
const ManagerKey = web3.Keypair.fromSecretKey(solana_account_privatekeyArray)
const solana_rpc = masterSetup.solana_rpc
    const anchorWallet = new Wallet(ManagerKey)

const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: 9000
})
const connection = new Connection(solana_rpc, "confirmed")
const AnchorConnection = new web3.Connection(solana_rpc, "confirmed")


export const findAndVESTING_ID = async (_BENEFICIARY: string, VESTING_ID = 0): Promise<[number, string]> => {
    const BENEFICIARY = new web3.PublicKey(_BENEFICIARY)
        // STEP 1: Derive PDA
    const [vestingPda, vestingBump] = web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("vesting"),
      BENEFICIARY.toBuffer(),
      TOKEN_MINT.toBuffer(),
      Uint8Array.of(VESTING_ID),
    ], PROGRAM_ID)

        //      Derive the escrow ATA owned by the PDA:
    const [escrowAta] = await web3.PublicKey.findProgramAddressSync([
        vestingPda.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        TOKEN_MINT.toBuffer(),
    ], ASSOCIATED_TOKEN_PROGRAM_ID)
    try {
        await getAccount(connection, escrowAta)
        if (++VESTING_ID > 255) {
            return [-1, '']
        }

        return await findAndVESTING_ID(_BENEFICIARY, VESTING_ID)
    } catch (ex) {
    }
    return [VESTING_ID, escrowAta.toBase58()]
    
}

export const init_gold_linear_vesting = async (_BENEFICIARY: string, _amount: number, lockedTmeDays: number, VESTING_ID: number, _startTimeDays: number) => {

    
    const TOTAL_AMOUNT_RAW = new BN(_amount* 10 ** SP_tokenDecimals)
    const BENEFICIARY = new web3.PublicKey(_BENEFICIARY)
    const now = Math.floor(Date.now() / 1000)
    const _startTime =  Math.floor(_startTimeDays * Time_Day)
    const START_TS = new BN(now + _startTime) // starts _startTime later
    const duration = Math.floor(Time_Day * lockedTmeDays)
    const DURATION_SEC = new BN(duration)
    


    const anchorProvider = new AnchorProvider(AnchorConnection, anchorWallet,  {
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
            return logger(`error vestingPda ${vestingPda.toBase58()} !== info.owner ${info.owner.toBase58()}`)
        }
        return logger(`error escrowAta ${escrowAta.toBase58()} already exits!`)

    } catch (ex) {
        const createEscrowIx = createAssociatedTokenAccountInstruction(
            ManagerKey.publicKey,    // payer
            escrowAta,
            vestingPda,         // owner of escrow
            TOKEN_MINT
        )
        
        const txCreate = new web3.Transaction().add(createEscrowIx)
        await anchorProvider.sendAndConfirm(txCreate, [ManagerKey])
        logger(`init_gold_linear_vesting escrowTokenAccount=${escrowAta.toBase58()}`)
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

// export const getBalanceFromPDA = async (BENEFICIARY: web3.Keypair) => {
    
//     const VESTING_ID = 0
//        // STEP 1: Derive PDA
//     const [vestingPda] = await PublicKey.findProgramAddressSync(
//         [Buffer.from("vesting"), BENEFICIARY.publicKey.toBuffer(), TOKEN_MINT.toBuffer(), Uint8Array.of(VESTING_ID)],
//         PROGRAM_ID
//     )

//     const anchorConnection = new web3.Connection(solana_rpc)

//     const anchorWallet = new Wallet(BENEFICIARY)
//     const anchorProvider = new AnchorProvider(anchorConnection, anchorWallet,  {
//         preflightCommitment: 'confirmed'
//     })


//     const program = new Program(anchor_linear_vesting_del as AnchorLinearVesting, anchorProvider)
    
//     // 3. Fetch balance
//     try {
//         const vestingAccount =  await program.account.vestingAccount.fetch(vestingPda)

//         // Fields (all BN):
//         //   vestingAccount.startTime
//         //   vestingAccount.releaseDuration
//         //   vestingAccount.totalAmount
//         //   vestingAccount.claimedAmount

//         // ───────────── Get “now” timestamp ─────────────
//         const latestSlot = await anchorProvider.connection.getSlot()
//         const nowTs = await anchorProvider.connection.getBlockTime(latestSlot)
//         if (nowTs === null) {
//             throw new Error("Failed to fetch block time")
//         }

//         // ───────────── Convert BN → BigInt/number ─────────────
//         const startTime = vestingAccount.startTime.toNumber() // UNIX seconds
//         const duration = vestingAccount.releaseDuration.toNumber() // seconds

//         // BN → BigInt:
//         const totalAmount = BigInt(vestingAccount.totalAmount.toString())
//         const claimedAmount = BigInt(vestingAccount.claimedAmount.toString())

//         // ───────────── Compute “claimable” ─────────────
//         const elapsed = nowTs - startTime
//         if (elapsed <= 0) {
//             console.log("Nothing has vested yet.")
//             console.log("claimable = 0")
//             return;
//         }

//         let vested: bigint;
//         if (elapsed >= duration) {
//             vested = totalAmount
//         } else {
//             vested = (totalAmount * BigInt(elapsed)) / BigInt(duration)
//         }

//         const rawClaimable = vested > claimedAmount ? vested - claimedAmount : 0n

//         console.log("─ VestingAccount data ─────────────────")
//         console.log("startTime (unix):", new Date(startTime*1000))
//         console.log("releaseDuration:", duration, "sec")
//         console.log("totalAmount (raw):", ethers.formatUnits(totalAmount, SP_tokenDecimals))
//         console.log("claimedAmount (raw):", ethers.formatUnits(claimedAmount, SP_tokenDecimals))
//         console.log("Now (unix):", new Date(nowTs*1000))
//         console.log("Elapsed (sec):", elapsed)
//         console.log("Vested so far (raw):", ethers.formatUnits(vested, SP_tokenDecimals))
//         console.log("Claimable now (raw):", ethers.formatUnits(rawClaimable, SP_tokenDecimals))


    
//         const uiClaimable = Number(rawClaimable) / 10 ** SP_tokenDecimals
//         console.log("Claimable (UI):", uiClaimable)

//         //console.log(`${userWallet.publicKey.toBase58()} ✅ Vesting account initialized: ${vestingPda.toBase58()}`,inspect(vestingAccount, false, 3, true), inspect({startTime, duration, totalAmount, claimedAmount}, false, 3, true))



//     } catch (ex) {
//         logger(`getBalanceFromPDA Error!`)
//     }

// }

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


const SolNumeric = 9
const usdtNumeric = 6 
const usdcNumeric = 6 
const SolAddress = 'So11111111111111111111111111111111111111112'
const USDCAddress = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const USDTAddress = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'

export const getUSDT2Sol_Price = async (usdt: string): Promise<string> => {
    const inputMint = USDTAddress
    const outputMint = SolAddress

    const amount = ethers.parseUnits(usdt, usdtNumeric)
    const slippageBps = 50; // 0.5% slippage
    const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`
    try {
        const quoteResponse = await axios.get(quoteUrl)
        const quote = quoteResponse.data
        const price = ethers.formatUnits(quote.otherAmountThreshold, SolNumeric)
        return price
    } catch (ex) {
    }
    return ''
}

export const exchangeSolToSP = async (_amount: string): Promise<number> => {
    const inputMint = SolAddress
    const outputMint = SP_address

    const amount = ethers.parseUnits(_amount, SolNumeric)
    const slippageBps = 50; // 0.5% slippage
    const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`

    try {
        const quoteResponse = await axios.get(quoteUrl)
        const quote = quoteResponse.data
        const SP_Price = ethers.formatUnits(quote.otherAmountThreshold, SP_tokenDecimals)
        logger(`exchangeSolToSP success ${_amount} Sol ===> ${SP_Price} SP`)
        // const swapInstructionsResponse = await axios.post('https://quote-api.jup.ag/v6/swap-instructions', {
        //     quoteResponse: quote,
        //     userPublicKey: ManagerKey.publicKey.toBase58(),
        //     wrapAndUnwrapSol: true,
        //     dynamicComputeUnitLimit: true,
        // })
        // const {
        //     setupInstructions,
        //     swapInstruction,
        //     cleanupInstruction,
        //     addressLookupTableAddresses,
        // } = swapInstructionsResponse.data
        
        // const deserializeInstruction = (instruction: any) =>
        //     new TransactionInstruction({
        //         programId: new PublicKey(instruction.programId),
        //         keys: instruction.accounts.map((key: any) => ({
        //             pubkey: new PublicKey(key.pubkey),
        //             isSigner: key.isSigner,
        //             isWritable: key.isWritable,
        //             })),
        //         data: Buffer.from(instruction.data, 'base64'),
        //     })
            
        // const setupIxs = setupInstructions.map(deserializeInstruction)
        // const swapIx = deserializeInstruction(swapInstruction)
        // const cleanupIxs = Array.isArray(cleanupInstruction) ? cleanupInstruction.map(deserializeInstruction) : [deserializeInstruction(cleanupInstruction)]

        // const altAccounts: AddressLookupTableAccount[] = []
        
        // for (const address of addressLookupTableAddresses) {
        //     const altAccountInfo = await connection.getAccountInfo(new PublicKey(address))
        //     if (altAccountInfo) {
        //         const altAccount = new AddressLookupTableAccount({
        //         key: new PublicKey(address),
        //         state: AddressLookupTableAccount.deserialize(altAccountInfo.data),
        //         });
        //         altAccounts.push(altAccount);
        //     }
        // }

        // const latestBlockhash = await connection.getLatestBlockhash();

        // const messageV0 = new web3.TransactionMessage({
        //     payerKey: ManagerKey.publicKey,
        //     recentBlockhash: latestBlockhash.blockhash,
        //     instructions: [...setupIxs, swapIx, ...cleanupIxs],
        // }).compileToV0Message(altAccounts)

        // const transaction = new web3.VersionedTransaction(messageV0)
        // transaction.sign([ManagerKey])
        // const anchorWallet = new Wallet(ManagerKey)
        
        // const anchorProvider = new AnchorProvider(AnchorConnection, anchorWallet,  {
        //     preflightCommitment: 'confirmed'
        // })

        // const signature = await anchorProvider.sendAndConfirm(transaction, [ManagerKey])
        // console.log('Transaction Signature:', signature)

        logger(`exchangeSolToSP Success!`)
        return parseFloat(SP_Price)
    } catch (ex: any) {
        logger(`exchangeSolToSP Error`, ex.message)
    }
    return 0

}


const JUPITER_API = "https://quote-api.jup.ag/v6/"

export const exchangeUSDCToSP = async (_amount: string): Promise<number> => {
    const inputMint = USDTAddress
    const outputMint = SP_address

    const amount = ethers.parseUnits(_amount, usdcNumeric)
    const slippageBps = 250; // 1% slippage
    const quoteUrl = `${JUPITER_API}quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`
    let SP_Price = '0'
    try {
        const quoteResponse = await axios.get(quoteUrl)
        const quote = quoteResponse.data
        SP_Price = ethers.formatUnits(quote.otherAmountThreshold, SP_tokenDecimals)
        logger(`exchangeUSDCToSP success ${_amount} USDT ===> ${SP_Price} SP`)
        const route = quote

        // const swapPostRes = await fetch(`${JUPITER_API}swap`, {
        //     method: "POST",
        //     headers: { "Content-Type": "application/json" },
        //     body: JSON.stringify({
        //         quoteResponse: route,
        //         userPublicKey: ManagerKey.publicKey.toBase58(),
        //         wrapUnwrapSOL: false,
        //         dynamicComputeUnitLimit: true,
        //         prioritizationFeeLamports: null
        //     }),
        // })

        // const swapPostJson = await swapPostRes.json()

        // if (!swapPostJson.swapTransaction) {
        //     throw new Error("No swapTransaction in Jupiter swap response");
        // }

        // // 3. Deserialize transaction
        // const swapTxBuf = Buffer.from(swapPostJson.swapTransaction, "base64")
        // const tx = VersionedTransaction.deserialize(swapTxBuf)
        // // 4. Sign and send
        // tx.sign([ManagerKey])

        // const signature = await connection.sendRawTransaction(tx.serialize())

        // logger("exchangeUSDCToSP:", signature)

        // await connection.confirmTransaction({
        //     signature,
        //     blockhash: tx.message.recentBlockhash,
        //     lastValidBlockHeight: await connection.getBlockHeight()
        // }, "confirmed")

        logger(`exchangeUSDCToSP Success!`)
        return parseFloat(SP_Price)
    } catch (ex: any) {
        logger(`exchangeSolToSP Error`, ex.message)
        return parseFloat(SP_Price)
    }
    

}

const testExchange = async (publicKey: string, totalSol: number, lockedTmeDays: number, startTimeDays: number) => {
    
    const SP_Amount = totalSol > 0 ? await exchangeSolToSP(totalSol.toString()) : await exchangeUSDCToSP(totalUSDC.toString())

    logger(`SP_Amount=${SP_Amount}`)
    const [uuu] = await findAndVESTING_ID (publicKey, 0)
    logger(`VESTING_ID = ${uuu}`)
    await init_gold_linear_vesting (publicKey, SP_Amount, lockedTmeDays,  uuu, startTimeDays)
    logger(`success!`)
    process.exit(0)
}


const [,,...args] = process.argv
let publicKey = ''
let lockedTmeDays = 0
let totalSol = 0
let totalUSDC = 0
let startTimeDays = 0

args.forEach ((n, index ) => {

	if (/^P\=/i.test(n)) {
		const srp = n.split('=')[1]
		publicKey = srp
	}
	if (/^L\=/i.test(n)) {
		lockedTmeDays = parseInt(n.split('=')[1])
	}

    if (/^E\=/i.test(n)) {
		startTimeDays = parseFloat(n.split('=')[1])
	}

	if (/^S\=/i.test(n)) {
		totalSol = parseFloat(n.split('=')[1])
	}

    if (/^U\=/i.test(n)) {
        totalUSDC = parseFloat(n.split('=')[1])
    }
    
})

if (publicKey && lockedTmeDays > 0 && (totalSol > 0 || totalUSDC > 0) && startTimeDays > 0) {
    testExchange (publicKey, totalSol, lockedTmeDays, startTimeDays )
}