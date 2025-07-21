import {getMint} from "@solana/spl-token"
import { Connection, PublicKey, Keypair, VersionedTransaction, Transaction } from "@solana/web3.js"
import {ethers} from 'ethers'
import { createJupiterApiClient, QuoteGetRequest,  } from '@jup-ag/api'
import bs58 from "bs58"
import { logger } from "./util"
import { inspect } from "node:util"
import ERC20_ABI from '../endpoint/cCNTPv7.json'
const SOLANA_CONNECTION = new Connection(
	"https://api.mainnet-beta.solana.com", "confirmed"
)
const usdtAddr = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
const solanaAddr = "So11111111111111111111111111111111111111112"
const usdcAddr = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const spAddr = "Bzr4aEQEXrk7k8mbZffrQ9VzX6V3PAH4LvWKXkKppump"

const solanaDecimalPlaces = 9
const usdtDecimalPlaces = 6
const usdcDecimalPlaces = 6
const spDecimalPlaces = 6

const jupiterQuoteApi = createJupiterApiClient()

const tokenDecimal = (tokenAddr: string) => {
	switch(tokenAddr) {
		case usdtAddr: {
			return usdtDecimalPlaces
		}
		case solanaAddr: {
			return solanaDecimalPlaces
		}
		case spAddr: {
			return spDecimalPlaces
		}
		case usdcAddr: {
			return usdcDecimalPlaces
		}
		default: {
			return 18
		}
	}
}

const getTokenQuote = async (from: string, to: string, fromEthAmount: string) => {
	
	const amount = ethers.formatUnits(fromEthAmount, tokenDecimal(from))
	const params: QuoteGetRequest = {
		inputMint: from,
		outputMint: to,
		amount: parseFloat(amount),
		slippageBps: 100
	}
	const quote = await jupiterQuoteApi.quoteGet(params)
	const price_sp = ethers.formatUnits(quote.outAmount, tokenDecimal(to))
	return price_sp
}
const SilentPassOfficial = 'A8Vk2LsNqKktabs4xPY4YUmYxBoDqcTdxY5em4EQm8v1'

const swapTokens = async (from: string, to: string, privateKey: string, fromEthAmount: string ) => {
	const wallet = Keypair.fromSecretKey(bs58.decode(privateKey))
	const amount = ethers.parseUnits(fromEthAmount, tokenDecimal(from))
	const quoteResponse = await (
		await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${from}&outputMint=${to}&amount=${amount}&restrictIntermediateTokens=true`)).json()

	const { swapTransaction } = await (
		await fetch('https://quote-api.jup.ag/v6/swap', {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({
                dynamicComputeUnitLimit: true,
                dynamicSlippage: true,
                prioritizationFeeLamports: {
                    priorityLevelWithMaxLamports: {
                        maxLamports: 1000000,
                        priorityLevel: "veryHigh"
                    }
                },
				// quoteResponse from /quote api
				quoteResponse,
				// user public key to be used for the swap
				userPublicKey: wallet.publicKey.toString()
				// auto wrap and unwrap SOL. default is true
				// wrapAndUnwrapSol: true,
				// Optional, use if you want to charge a fee.  feeBps must have been passed in /quote API.
				// feeAccount: "fee_account_public_key"
			})
		})).json()
	const swapTransactionBuf = Buffer.from(swapTransaction, 'base64')
	const transaction = VersionedTransaction.deserialize(swapTransactionBuf)
	// get the latest block hash
    
	const latestBlockHash = await SOLANA_CONNECTION.getLatestBlockhash()
	// Execute the transaction
    transaction.sign([wallet])
    
	const rawTransaction = transaction.serialize()
	const txid = await SOLANA_CONNECTION.sendRawTransaction(rawTransaction, {
		skipPreflight: true,
		maxRetries: 2
	})
    logger(txid)
	const result = await getTransaction (txid)
	
    logger(`swapTokens finished result =  ${result}`)
	
}

const getTransaction = (tx: string, count = 0): Promise<false|string> => new Promise( async resolve => {
    count ++
    logger(`getTransaction count = ${count}`)
    const thash = await SOLANA_CONNECTION.getTransaction(tx,{ maxSupportedTransactionVersion: 0 })
    if (!thash) {
        if (count < 6) {
            return setTimeout(async () => {
                return resolve(await getTransaction(tx, count))
            }, 1000 * 10 )
        }
        return resolve(false)
    }
    if (!thash.meta?.err) {
        return resolve (tx)
    }
    return resolve (false)
})

const Sp2Sol = async (amount: string) => {
	const privateKey = ''
	const quote = await getTokenQuote(spAddr, solanaAddr, amount)
	const tx = await swapTokens(spAddr, solanaAddr, privateKey, amount)
}



const Sol2Sp = async (amount: string) => {
	const privateKey = ''
	const quote = await getTokenQuote(solanaAddr, spAddr, amount)
	const tx = await swapTokens(solanaAddr, spAddr, privateKey, amount)
}
let cryptopWaymentWallet = 0
const cryptoPayWallet = ethers.Wallet.createRandom()
const getNextWallet = () => {
    return cryptoPayWallet.deriveChild(cryptopWaymentWallet++)
}
const createWallet = () => {
    logger(inspect(cryptoPayWallet, false, 3, true ))
}

const bnbPrivate = new ethers.JsonRpcProvider('https://bsc-dataseed.bnbchain.org/')
const getBNB_UST = async (wallet:string) => {
    const contract = new ethers.Contract('0x55d398326f99059fF775485246999027B3197955', ERC20_ABI, bnbPrivate)
    const balance = await contract.balanceOf (wallet)
    const bb = ethers.formatEther(balance)
    logger(inspect(bb, false, 3, true))
}

getBNB_UST('0x83a77a20d98179b2445f5b43ade947b4b368f4be')

// createWallet()