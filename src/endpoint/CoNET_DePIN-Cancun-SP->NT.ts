import { Connection, PublicKey, Keypair,Transaction, sendAndConfirmTransaction } from "@solana/web3.js"
import { getOrCreateAssociatedTokenAccount, createTransferInstruction } from "@solana/spl-token"
import {ethers} from "ethers"
import { logger, masterSetup } from "../util/util"
import {inspect} from 'node:util'
import Colors from 'colors/safe'
import {webcrypto} from 'node:crypto'
import { createJupiterApiClient, QuoteGetRequest } from '@jup-ag/api'
import SP_Oracle_ABI from './SP_OracleABI.json'
import Bs58 from 'bs58'

const CoNET_CancunRPC = 'https://cancun-rpc.conet.network'
const SP_Oracle_Addr = '0xA57Dc01fF9a340210E5ba6CF01b4EE6De8e50719'
const endPointCancun = new ethers.JsonRpcProvider(CoNET_CancunRPC)
const SP_Oracle_SC_reaonly = new ethers.Contract(SP_Oracle_Addr, SP_Oracle_ABI, endPointCancun)
const SOLANA_CONNECTION = new Connection(
	"https://api.mainnet-beta.solana.com" // We only support mainnet.
)
const solana_account = masterSetup.solanaManager
const solana_account_privatekeyArray = Bs58.decode(solana_account)
const solana_account_privatekey = Keypair.fromSecretKey(solana_account_privatekeyArray)

const SP_address = 'Bzr4aEQEXrk7k8mbZffrQ9VzX6V3PAH4LvWKXkKppump'
const sp_team = '2UbwygKpWguH6miUbDro8SNYKdA66qXGdqqvD6diuw3q'
const spDecimalPlaces = 6

interface OracleData {
	timeStamp: number
	data: spOracle| null
}

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

const checkPrice = async (_amount: string) => {
	await getOracle()
	

	logger(inspect(oracleData, false, 3, true))
	const amount = parseFloat(_amount)
	if (oracleData.data == null) {
		return logger(`checkPrice oracleData?.data is NULL Error!`)
	}
	// check sp9999
	const sp249 = parseFloat(oracleData.data.sp249)
	const sp999 = parseFloat(oracleData.data.sp999)
	const sp2499 = parseFloat(oracleData.data.sp2499)
	const sp9999 = parseFloat(oracleData.data.sp9999)
	if (Math.abs(amount - sp249) < sp249 * 0.1) {
		return 'sp249'
	}
	if (Math.abs(amount - sp999) < sp999 * 0.1) {
		return 'sp999'
	}
	if (Math.abs(amount - sp2499) < sp2499 * 0.1) {
		return 'sp999'
	}
	if (Math.abs(amount - sp9999) < sp9999 * 0.1) {
		return 'sp999'
	}

	return ''
}

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
	const signature = await sendAndConfirmTransaction ( SOLANA_CONNECTION, tx,[solana_account_privatekey])
	logger(inspect(signature, false, 3, true))
	
}

const checkts = async (solanaTx: string) => {

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
			if (from && preTokenBalances[0].mint === SP_address && preTokenBalances[1].owner === sp_team) {
				
				const _transferAmount = parseFloat(postTokenBalances[1].uiTokenAmount.amount) - parseFloat(preTokenBalances[1].uiTokenAmount.amount)
				const amount = ethers.formatUnits(_transferAmount.toFixed(0), spDecimalPlaces)
				logger(Colors.blue(`transferAmount = ${amount}`))
				const check = await checkPrice(amount)
				
				if (!check) {
					returnPool.push ({
						from, amount
					})
					returnSP()
					return logger(Colors.magenta(`check = false back! ${amount}`))
				}
			}

		}
		
		
	}
	
	// const ACCOUNT_TO_WATCH = new PublicKey('2UbwygKpWguH6miUbDro8SNYKdA66qXGdqqvD6diuw3q')
	// const subscriptionId = await connection.onLogs (
	// 	ACCOUNT_TO_WATCH,
	// 	async (updatedAccountInfo) => {
	// 		console.log("Received log", updatedAccountInfo)
			
	// 	},
	// )
	
}
//	'2ZmJLrTCxAuoDQg2zoKSy6AhDLTHzVS65dhHAoR89k5qs3ddftAc7BwmWbtCLco1r6TBoxWeNdR1thNHMNaaqYdP'
checkts('2ZmJLrTCxAuoDQg2zoKSy6AhDLTHzVS65dhHAoR89k5qs3ddftAc7BwmWbtCLco1r6TBoxWeNdR1thNHMNaaqYdP')