import {getMint} from "@solana/spl-token"
import { Connection, PublicKey, Keypair, VersionedTransaction } from "@solana/web3.js"
import {ethers} from 'ethers'
import { createJupiterApiClient, QuoteGetRequest,  } from '@jup-ag/api'
import bs58 from "bs58"

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

const swapTokens = async (from: string, to: string, privateKey: string, fromEthAmount: string ) => {
	const wallet = Keypair.fromSecretKey(bs58.decode(privateKey))
	const amount = ethers.formatUnits(fromEthAmount, tokenDecimal(from))
	const quoteResponse = await (
		await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${from}\
			&outputMint=${to}\
			&amount=${amount}\
			&slippageBps=100`)).json()
	const { swapTransaction } = await (
		await fetch('https://quote-api.jup.ag/v6/swap', {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({
				// quoteResponse from /quote api
				quoteResponse,
				// user public key to be used for the swap
				userPublicKey: wallet.publicKey.toString(),
				// auto wrap and unwrap SOL. default is true
				wrapAndUnwrapSol: true,
				// Optional, use if you want to charge a fee.  feeBps must have been passed in /quote API.
				// feeAccount: "fee_account_public_key"
			})
		})).json()
	const swapTransactionBuf = Buffer.from(swapTransaction, 'base64')
	const transaction = VersionedTransaction.deserialize(swapTransactionBuf)
	// get the latest block hash
	const latestBlockHash = await SOLANA_CONNECTION.getLatestBlockhash()
	// Execute the transaction
	const rawTransaction = transaction.serialize()
	const txid = await SOLANA_CONNECTION.sendRawTransaction(rawTransaction, {
		skipPreflight: true,
		maxRetries: 2
	})
	await SOLANA_CONNECTION.confirmTransaction({
		blockhash: latestBlockHash.blockhash,
		lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
		signature: txid
	})

	return txid
}

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