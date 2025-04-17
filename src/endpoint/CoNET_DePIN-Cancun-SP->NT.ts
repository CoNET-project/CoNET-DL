import { Connection, PublicKey, Keypair,Transaction, sendAndConfirmTransaction, TransactionMessage, VersionedTransaction, TransactionSignature, TransactionConfirmationStatus, SignatureStatus } from "@solana/web3.js"
import { getOrCreateAssociatedTokenAccount,createBurnCheckedInstruction, createTransferInstruction, getAssociatedTokenAddress } from "@solana/spl-token"
import {ethers} from "ethers"
import { logger, masterSetup } from "../util/util"
import {inspect} from 'node:util'
import Colors from 'colors/safe'
import {webcrypto} from 'node:crypto'
import { createJupiterApiClient, QuoteGetRequest } from '@jup-ag/api'
import SP_Oracle_ABI from './SP_OracleABI.json'
import Bs58 from 'bs58'
import SP_purchase_eventABI from './SP_purchase_eventABI.json'
import SP_mainnetABI from './CoNET_DEPIN-mainnet_SP-API.json'

const CoNET_CancunRPC = 'https://cancun-rpc.conet.network'
const CoNETMainnetRPC = 'https://mainnet-rpc.conet.network'
const SOLANA_CONNECTION = new Connection(
	"https://api.mainnet-beta.solana.com" // We only support mainnet.
)
const endPointCancun = new ethers.JsonRpcProvider(CoNET_CancunRPC)
const endPointMainnet = new ethers.JsonRpcProvider(CoNETMainnetRPC)

const SP_Oracle_Addr = '0xA57Dc01fF9a340210E5ba6CF01b4EE6De8e50719'
const SP_purchase_Addr = '0xE111F88A0204eE1F5DFE2cF5796F9C2179EeBBDd'.toLowerCase()
const mainnet_passport_addr = '0x054498c353452A6F29FcA5E7A0c4D13b2D77fF08'




const SP_Oracle_SC_reaonly = new ethers.Contract(SP_Oracle_Addr, SP_Oracle_ABI, endPointCancun)

const solana_account = masterSetup.solanaManager
const solana_account_privatekeyArray = Bs58.decode(solana_account)
const solana_account_privatekey = Keypair.fromSecretKey(solana_account_privatekeyArray)

const SP_address = 'Bzr4aEQEXrk7k8mbZffrQ9VzX6V3PAH4LvWKXkKppump'
const sp_team = '2UbwygKpWguH6miUbDro8SNYKdA66qXGdqqvD6diuw3q'
const sp_NGO = '6g5CHuv3tUHMupdccP6s7jRbEPjks2DAM5T5GYfrqvWz'

const spDecimalPlaces = 6


const SP_purchaseWallet = new ethers.Wallet(masterSetup.SP_purchase[0], endPointCancun)
const SP_purchase_event_SC = new ethers.Contract(SP_purchase_Addr, SP_purchase_eventABI, SP_purchaseWallet)

const SP_NFT_SC_pool: ethers.Contract[]= []
const SP_NFT_managerWallet = new ethers.Wallet(masterSetup.SP_purchase[0], endPointMainnet)
const SP_NFT_SC = new ethers.Contract(mainnet_passport_addr, SP_mainnetABI, SP_NFT_managerWallet)
SP_NFT_SC_pool.push(SP_NFT_SC)

const SP_purchase_event_SCPool: ethers.Contract[] = []
SP_purchase_event_SCPool.push(SP_purchase_event_SC)


const SP_purchase_Success: string[] = []
const SP_purchase_Failed: {
	tx: string
	amount: string
}[] = []



let oracleData: OracleData = {
	timeStamp: 0,
	data:null
}

const getOracle = async () => {
	const timeStamp = new Date().getTime()
	if (oracleData && timeStamp - oracleData.timeStamp > 1000 * 60 ) {
		try {

			const [_sp249, _sp999, _sp2499, _sp9999, _so] = await SP_Oracle_SC_reaonly.getQuote()
			const sp249 = ethers.formatEther(_sp249)
			const sp999 = ethers.formatEther(_sp999)
			const sp2499 = ethers.formatEther(_sp2499)
			const sp9999 = ethers.formatEther(_sp9999)
			const so = ethers.formatEther(_so)
			oracleData = {
				timeStamp,
				data: {
					sp249, sp999, sp2499, sp9999, so
				}
			}
			
		} catch (ex: any) {
			return logger(`getOracle Error ${ex.message}`)
		}
	}
}

type nftType = 'sp9999'| 'sp2499'| 'sp999'| 'sp249'|''

const checkPrice: (_amount: string) => Promise<nftType> = async (_amount: string) => new Promise( async resolve=>{
	await getOracle()
	

	logger(inspect(oracleData, false, 3, true))
	const amount = parseFloat(_amount)
	if (oracleData.data == null) {
		resolve('')
		return logger(`checkPrice oracleData?.data is NULL Error!`)
	}
	// check sp9999
	const sp249 = parseFloat(oracleData.data.sp249)
	const sp999 = parseFloat(oracleData.data.sp999)
	const sp2499 = parseFloat(oracleData.data.sp2499)
	const sp9999 = parseFloat(oracleData.data.sp9999)

	
	if (Math.abs(amount - sp9999) < sp9999 * 0.05) {
		return resolve('sp9999')
	}
	if (Math.abs(amount - sp2499) < sp2499 * 0.05) {
		return resolve('sp2499')
	}
	if (Math.abs(amount - sp999) < sp999 * 0.05) {
		return resolve('sp999')
	}
	if (Math.abs(amount - sp249) < sp249 * 0.05) {
		return resolve('sp249')
	}

	return resolve('')
})

const returnPool: {
	from: string
	amount: string
}[] = []

const returnSP = async () => {
	//	SP detail 
	// const detail = await SOLANA_CONNECTION.getParsedAccountInfo(new PublicKey(SP_address))
	// logger(inspect(detail, false, 3, true))


	const returnData = returnPool.shift()
	if (!returnData) {
		return
	}

	let sourceAccount = await getOrCreateAssociatedTokenAccount(
        SOLANA_CONNECTION, 
        solana_account_privatekey,
        new PublicKey(SP_address),
        solana_account_privatekey.publicKey
    )
	let destinationAccount = await getOrCreateAssociatedTokenAccount(
        SOLANA_CONNECTION, 
        solana_account_privatekey,
        new PublicKey(SP_address),
        new PublicKey(returnData.from)
    )
	const tx = new Transaction()
	tx.add (createTransferInstruction(
        sourceAccount.address,
        destinationAccount.address,
        solana_account_privatekey.publicKey,
        ethers.parseUnits(returnData.amount, spDecimalPlaces)
    ))

	const latestBlockHash = await SOLANA_CONNECTION.getLatestBlockhash('confirmed')
	tx.recentBlockhash = await latestBlockHash.blockhash
	try {
		const signature = await sendAndConfirmTransaction ( SOLANA_CONNECTION, tx,[solana_account_privatekey])
		logger(Colors.magenta(`returnSP to ${returnData.from} success ${signature}`))
	} catch (ex: any) {
		logger(Colors.red(`returnSP Error! ${ex.message}`))
	}
	
	returnSP()
}


const transferTo_SPNGO = async (amount: string) => {
	let sourceAccount = await getOrCreateAssociatedTokenAccount(
        SOLANA_CONNECTION, 
        solana_account_privatekey,
        new PublicKey(SP_address),
        solana_account_privatekey.publicKey
    )
	let destinationAccount = await getOrCreateAssociatedTokenAccount(
        SOLANA_CONNECTION, 
        solana_account_privatekey,
        new PublicKey(SP_address),
        new PublicKey(sp_NGO)
    )
	const tx = new Transaction()
	tx.add (createTransferInstruction(
        sourceAccount.address,
        destinationAccount.address,
        solana_account_privatekey.publicKey,
        ethers.parseUnits(amount, spDecimalPlaces)
    ))

	const latestBlockHash = await SOLANA_CONNECTION.getLatestBlockhash('confirmed')
	tx.recentBlockhash = await latestBlockHash.blockhash
	try {
		const signature = await sendAndConfirmTransaction ( SOLANA_CONNECTION, tx,[solana_account_privatekey])
		logger(Colors.magenta(`transferTo_SPNGO success ${signature}`))
	} catch (ex: any) {
		logger(Colors.magenta(`transferTo_SPNGO Error${ex.message}`))
	}
	
	
}

const process_SP_purchase__Failed = async () => {
	const obj = SP_purchase_Failed.shift()
	if (!obj) {
		return
	}
	const SC = SP_purchase_event_SCPool.shift()
	if (!SC) {
		SP_purchase_Failed.unshift(obj)
		return setTimeout(() => {
			process_SP_purchase__Failed()
		})
	}

	try {
		const tx = await SC._purchaseFailed(obj.tx,  ethers.parseUnits(obj.amount, spDecimalPlaces))
		await tx.wait()
		logger(Colors.magenta(`process_SP_purchase_Success success! ${tx.hash}`))

	} catch (ex: any) {
		logger(Colors.magenta(`process_SP_purchase_Success Error! [${ex.message}]`))
	}
	SP_purchase_event_SCPool.push(SC)

	setTimeout(() => {
		process_SP_purchase__Failed()
	}, 1000)

}

const process_SP_purchase_Success = async () => {
	const solanaTx = SP_purchase_Success.shift()
	if (!solanaTx) {
		return
	}
	const SC = SP_purchase_event_SCPool.shift()

	if (!SC) {
		SP_purchase_Success.unshift(solanaTx)
		return setTimeout(() => {
			process_SP_purchase_Success()
		}, 1000)
	}
	try {
		const tx = await SC._purchaseSuccess(solanaTx)
		await tx.wait()
		logger(Colors.magenta(`process_SP_purchase_Success success! ${tx.hash}`))

	} catch (ex: any) {
		logger(Colors.magenta(`process_SP_purchase_Success Error! [${ex.message}]`))
	}
	SP_purchase_event_SCPool.push(SC)
	setTimeout(() => {
		process_SP_purchase_Success()
	}, 1000)

}

const checkts = async (solanaTx: string, ethWallet: string) => {

	//		from: J3qsMcDnE1fSmWLd1WssMBE5wX77kyLpyUxckf73w9Cs
	//		to: 2UbwygKpWguH6miUbDro8SNYKdA66qXGdqqvD6diuw3q
	
	const tx = await SOLANA_CONNECTION.getTransaction(solanaTx, {maxSupportedTransactionVersion: 0})
	const meta = tx?.meta
	if (meta) {
		// logger(inspect(meta, false, 3, true))
		const postTokenBalances = meta.postTokenBalances
		const preTokenBalances = meta.preTokenBalances
		if (preTokenBalances?.length == 2 && postTokenBalances?.length == 2) {
			const from = postTokenBalances[0].owner
			if (from && preTokenBalances[0].mint === SP_address && (preTokenBalances[0].owner === sp_team || preTokenBalances[1].owner === sp_team)) {
				const index = preTokenBalances[0].owner === sp_team ? 0 : 1

				if (postTokenBalances[index].uiTokenAmount && preTokenBalances[index].uiTokenAmount) {
					const preAmount = parseFloat(preTokenBalances[index].uiTokenAmount.uiAmount ? preTokenBalances[index].uiTokenAmount.uiAmount.toString() : "0")
					const postAmount = parseFloat( postTokenBalances[index].uiTokenAmount.uiAmount ? postTokenBalances[index].uiTokenAmount.uiAmount.toString() : "0")
					const _amount = postAmount - preAmount
					logger(Colors.blue(`transferAmount = ${_amount}`))
					const nftType = await checkPrice(_amount.toFixed(4))
					
					if (nftType === '') {

						const amount = parseFloat(_amount.toFixed(4)) * 0.97
						if (amount > 0.1) {
							returnPool.push ({
								from, amount: amount.toFixed(4)
							})
	
							SP_purchase_Failed.push({
								tx: solanaTx,
								amount: amount.toFixed(4)
							})

							returnSP()
						}
						
						process_SP_purchase__Failed()
						
						return logger(Colors.magenta(`check = false back amount! ${amount} to address [${from}]`))
					}

					logger(Colors.magenta(`Purchase ${ethWallet} NFT ${nftType}`))
					process_mintNFT_pool.push(
						{
							to: ethWallet,
							nftType
						}
					)
					const brunAmount = (_amount * 0.1).toFixed(4)
					mintNFT()
					SP_purchase_Success.push(solanaTx)
					process_SP_purchase_Success()
					// brunSP(brunAmount)
					transferTo_SPNGO (brunAmount)
					return logger(Colors.magenta(`NFT success! for ${solanaTx} [${ethWallet}]`))
				}

				logger(inspect(preTokenBalances, false, 3, true))
				logger(inspect(postTokenBalances, false, 3, true))
				return logger(Colors.red(`NFT Errot! from ${from} postTokenBalances[1].uiTokenAmount && preTokenBalances[1].uiTokenAmount [${postTokenBalances[1].uiTokenAmount && preTokenBalances[1].uiTokenAmount}]`))

			}
			logger(inspect(preTokenBalances, false, 3, true))
			logger(inspect(postTokenBalances, false, 3, true))
			return logger(Colors.magenta(`NFT Errot! from ${from} preTokenBalances[0].mint === SP_address ${preTokenBalances[0].mint === SP_address} preTokenBalances[0].owner === sp_team ${preTokenBalances[0].owner === sp_team}`))
		}
		
		return logger(Colors.magenta(`NFT Errot! preTokenBalances?.length ${ preTokenBalances?.length}postTokenBalances?.length ${postTokenBalances?.length} Error!`))
	}
	
	// const ACCOUNT_TO_WATCH = new PublicKey('2UbwygKpWguH6miUbDro8SNYKdA66qXGdqqvD6diuw3q')
	// const subscriptionId = await connection.onLogs (
	// 	ACCOUNT_TO_WATCH,
	// 	async (updatedAccountInfo) => {
	// 		console.log("Received log", updatedAccountInfo)
			
	// 	},
	// )
	
}

const checkCNTPTransfer = async (tR: ethers.TransactionReceipt) => {
	
	for (let log of tR.logs) {
		const LogDescription = SP_purchase_event_SC.interface.parseLog(log)
		
		if (LogDescription?.name === 'purchaseNFT') {
			logger(Colors.magenta(`holeskyBlockListenning purchaseNFT ${LogDescription?.name}`))
			const toAddress  = LogDescription.args[0]
			const solanaTx = LogDescription.args[1]
			checkts(solanaTx, toAddress)
		}
	}
}

const process_mintNFT_pool: {
	to: string
	nftType: nftType
}[] = []

const mintNFT = async () => {
	const obj = process_mintNFT_pool.shift()
	if (!obj) {
		return
	}
	const SC = SP_NFT_SC_pool.shift()
	if (!SC) {
		process_mintNFT_pool.unshift(obj)
		return setTimeout(() => {
			mintNFT ()
		}, 1000)
	}
	const premium = (obj.nftType === 'sp2499'|| obj.nftType === 'sp9999') ? true : false
	const expiresDayes = premium ? 365 : 31
	try {
		const tx = await SC.mintPassport(obj.to, expiresDayes, premium)
		await tx.wait()
		const __transfer = {
            to: obj.to,
            value: ethers.parseEther('0.00001')
        }

		const tx1 = await SP_NFT_managerWallet.sendTransaction(__transfer)
		await tx1.wait()

		logger(Colors.magenta(`process_mintNFT_pool [${obj.to}]ETh = ${tx1.hash}`))
	} catch (ex: any) {
		logger(Colors.red(`mintNFT got Error! ${ex.message}`))
	}

	SP_NFT_SC_pool.push(SC)
	setTimeout(() => {
		mintNFT ()
	}, 2000)

}



const confirmTransaction = async (
    connection: Connection,
    signature: TransactionSignature,
    desiredConfirmationStatus: TransactionConfirmationStatus = 'confirmed',
    timeout: number = 30000,
    pollInterval: number = 1000,
    searchTransactionHistory: boolean = false
): Promise<SignatureStatus>  => {
    const start = Date.now()

    while (Date.now() - start < timeout) {
        const { value: statuses } = await connection.getSignatureStatuses([signature], { searchTransactionHistory })

        if (!statuses || statuses.length === 0) {
            throw new Error('Failed to get signature status')
        }

        const status = statuses[0];

        if (status === null) {
            await new Promise(resolve => setTimeout(resolve, pollInterval))
            continue
        }

        if (status.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`)
        }

        if (status.confirmationStatus && status.confirmationStatus === desiredConfirmationStatus) {
            return status;
        }

        if (status.confirmationStatus === 'finalized') {
            return status;
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval))
    }

    throw new Error(`Transaction confirmation timeout after ${timeout}ms`)
}


const brunSP = async (brunNUmber: string) => {
	const account = await getAssociatedTokenAddress(new PublicKey(SP_address), solana_account_privatekey.publicKey)
	logger(inspect(account, false, 3, true))
	const burnIx = createBurnCheckedInstruction(
		account, // PublicKey of Owner's Associated Token Account
		new PublicKey(SP_address), // Public Key of the Token Mint Address
		solana_account_privatekey.publicKey, // Public Key of Owner's Wallet
		ethers.parseUnits(brunNUmber, spDecimalPlaces), // Number of tokens to burn
		spDecimalPlaces // Number of Decimals of the Token Mint
	)
	const { blockhash, lastValidBlockHeight } = await SOLANA_CONNECTION.getLatestBlockhash('finalized')
	const messageV0 = new TransactionMessage({
		payerKey: solana_account_privatekey.publicKey,
		recentBlockhash: blockhash,
		instructions: [burnIx]
	  }).compileToV0Message()
	const transaction = new VersionedTransaction(messageV0)
    transaction.sign([solana_account_privatekey])
	const txid = await SOLANA_CONNECTION.sendTransaction(transaction)
	
	try {
		const confirmation = await confirmTransaction(SOLANA_CONNECTION, txid)
		logger(Colors.magenta(`brunSP success ${txid}`))
		logger(inspect(confirmation, false, 3, true))
	} catch (ex:any) {
		logger(Colors.red(`brunSP Error ${ex.message}`))
		return brunSP (brunNUmber)
	}
}

let currentBlock = 0

const getBlock = async (block: number) => {
	const blockTs = await endPointCancun.getBlock(block)
	if (!blockTs?.transactions) {
		return logger(Colors.gray(`holeskyBlockListenning ${block} has none`))
	}
	logger(Colors.gray(`holeskyBlockListenning ${block} has process now!`))
	for (let tx of blockTs.transactions) {

		const event = await endPointCancun.getTransactionReceipt(tx)
		
		if ( event?.to?.toLowerCase() === SP_purchase_Addr) {
			
			checkCNTPTransfer(event)
		}
		
	}
}

const daemondStart = async () => {
	
	currentBlock = await endPointCancun.getBlockNumber()
	logger(Colors.magenta(`CoNET DePIN passport airdrop daemon Start from block [${currentBlock}]`))
	endPointCancun.on('block', async block => {
		if (block > currentBlock) {
			currentBlock = block
			getBlock(block)
		}
		
	})
}

daemondStart()

