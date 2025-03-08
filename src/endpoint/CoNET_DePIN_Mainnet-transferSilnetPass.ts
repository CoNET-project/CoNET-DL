import {JsonRpcProvider, Contract, Wallet, TransactionResponse, TransactionReceipt, formatEther, BigNumberish, ethers} from 'ethers'
import {logger, masterSetup} from '../util/util'
import Colors from 'colors/safe'
import {inspect} from 'node:util'
import SP_ABI from './CoNET_DEPIN-mainnet_SP-API.json'
import { Connection, PublicKey, Keypair,Transaction, sendAndConfirmTransaction, TransactionMessage, VersionedTransaction, TransactionSignature, TransactionConfirmationStatus, SignatureStatus } from "@solana/web3.js"
import { getOrCreateAssociatedTokenAccount,createBurnCheckedInstruction, createTransferInstruction, getAssociatedTokenAddress } from "@solana/spl-token"
import SP_purchase_eventABI from './SP_purchase_eventABI.json'

const CoNETMainChainRPC = 'https://mainnet-rpc.conet.network'
const endPointCoNETMainnet = new JsonRpcProvider(CoNETMainChainRPC)
const SP_Contract_addr = '0x054498c353452A6F29FcA5E7A0c4D13b2D77fF08'
const SOLANA_CONNECTION = new Connection(
	"https://solana-rpc.conet.network" // We only support mainnet.
)

const transferSP = async (from: string, to: string, nftNum: string) => {
	const wallet = new ethers.Wallet(from, endPointCoNETMainnet)
	const SC = new ethers.Contract(SP_Contract_addr, SP_ABI, wallet)
	logger(Colors.blue(`from ${wallet.address}`))
	try {
		const tx = await SC.safeTransferFrom(wallet.address, to, nftNum, 1, '0x00')
		await tx.wait()
		logger(Colors.magenta(`safeTransferFrom success! ${tx.hash}`))

	} catch (ex:any) {
		logger(Colors.red(`safeTransferFrom Error!, ${ex.message}`))
	}

}

const getSoBalance = async (publicKey: string) => {
	const wallet = new PublicKey(publicKey)
	const balance = await SOLANA_CONNECTION.getBalance(wallet)
	logger(inspect(balance, false, 3, true))
}
//		curl -H "Origin: https://vpn.conet.network" --verbose https://api.mainnet-beta.solana.com
//		curl -d 'service=vpn.conet.network' -d 'method=Say.Hello' -d 'request={"name": "John"}' https://api.mainnet-beta.solana.com
//		curl -d 'method=Say.Hello' -d 'request={"name": "John"}' https://api.mainnet-beta.solana.com
//		curl -X POST -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":"json","method":"add","params":[1, 2]}' https://mainnet-rpc.conet.network
//		curl -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1, "method":"getHealth"}' https://mainnet-rpc.conet.network
//		curl -H "Origin: https://vpn.conet.network" -s -X POST -H "Content-Type: application/json" -d '{"jsonrpc": "2.0","id": 1,"method": "getBalance","params": ["mDisFS7gA9Ro8QZ9tmHhKa961Z48hHRv2jXqc231uTF"]}' https://api.mainnet-beta.solana.com 
//		curl -v -H "Origin: https://vpn.conet.network" -s -X POST -H "Content-Type: application/json" -d '{"jsonrpc": "2.0","id": 1,"method": "getBalance","params": ["mDisFS7gA9Ro8QZ9tmHhKa961Z48hHRv2jXqc231uTF"]}' https://solana-rpc.conet.network 
//		
//		curl -d 'service=vpn.conet.network' -s -X POST -H "Content-Type: application/json" -d '{"jsonrpc": "2.0","id": 1,"method": "getBalance","params": ["mDisFS7gA9Ro8QZ9tmHhKa961Z48hHRv2jXqc231uTF"]}' https://api.mainnet-beta.solana.com 
//		curl -H "Origin: https://vpn.conet.network" -s -X POST -H "Content-Type: application/json" -d '{"message": "{\"walletAddress\":\"0x99dF30a8ddDAd8a96A920aB9B5e31eF0161217b4\",\"solanaWallet\":\"BSHs8zgFd2PEbQEpcV3v9t9XDH55pBPys41cfDmXiC5N\",\"referrer\":\"\"}","signMessage":"0xd8c0942e063cb696febf782956879c72f6e72f0be3f55006af33f0e789e2ed570a30ae4071deffdb57e67f3fc467a9c56e6d1ed2a9a038ff70264f294ecc85541c"}' 
// 		transferSP('0x15c2c6b16b968ba2823031dae29143cfb4ab360579722e07722f6be6c1370b5b', '0x7Ee561508ef8ddA4063A4215c05b7E9D962a45ed', '116')

//	curl -d 'service=vpn.conet.network' -s -X POST -H "Content-Type: application/json" -d '{"jsonrpc": "2.0","id": 1, "method":"getAccountInfo", "jsonrpc":"2.0", "params":["EzozEmk2pcroo7a7FvpPXppP6Q9vX8EgUYegLH3d6ghP",{"encoding":"base64"}],"id":"787975a4-366a-4ffd-b25e-38444b43c38a"}' https://solana-rpc.conet.network  

const conetProvider = new ethers.JsonRpcProvider('https://cancun-rpc.conet.network')
const SC = new ethers.Contract('0xE111F88A0204eE1F5DFE2cF5796F9C2179EeBBDd', SP_purchase_eventABI, conetProvider)

const checkCNTPTransfer = (tR: ethers.TransactionReceipt, contract: ethers.Contract, wallet: string) => new Promise(resolve=>{
	for (let log of tR.logs) {
		const LogDescription = contract.interface.parseLog(log)
		if (LogDescription?.args?.length) {
			const toAddress = LogDescription.args[0]
			const tx = LogDescription.args[1]
			if (toAddress.toLocaleLowerCase() === wallet) {
				if (LogDescription?.name === 'purchaseSuccess') {
					return resolve (true)
				}
			}
		}
		
	}
	resolve(false)
})

const getBlock = async (block: number, wallet: string, contract: ethers.Contract) => {
	logger(await SC.getAddress())
	const blockTs = await conetProvider.getBlock(block)
	if (!blockTs?.transactions) {
		return
	}
	const contractAddr = (await contract.getAddress()).toLocaleLowerCase()
	for (let tx of blockTs.transactions) {

		const event = await conetProvider.getTransactionReceipt(tx)

		if ( event?.to?.toLowerCase() === contractAddr.toLocaleLowerCase()) {

			checkCNTPTransfer(event, contract, wallet.toLocaleLowerCase())
		}
		
	}
}



