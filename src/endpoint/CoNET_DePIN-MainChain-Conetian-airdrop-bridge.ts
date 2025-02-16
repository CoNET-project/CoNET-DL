import {ethers} from 'ethers'
import {masterSetup, logger} from '../util/util'
import CoNET_DePIN_ABI from './CoNET_DePIN.json'
import Colors from 'colors/safe'
import {inspect} from 'node:util'
import Cancun_CNTP_airdorpABI from '../util/Cancun_CNTP_airdorpABI.json'


const CoNETMainChainRPC = 'https://mainnet-rpc.conet.network'
const CoNET_CancunRPC = 'https://cancun-rpc.conet.network'
const Cancun_CNTP_airdrop_updated_addr = '0x41B2e6da821066bf99C30058C91ea5b2A80888E7'.toLowerCase()
const endPointCoNETMainnet = new ethers.JsonRpcProvider(CoNETMainChainRPC)
const provode_Cancun = new ethers.JsonRpcProvider(CoNET_CancunRPC)
const managerWallet = new ethers.Wallet(masterSetup.conetian_eth_airdrop, endPointCoNETMainnet)
const CoNET_DePIN_addr = '0xc4D5cc27026F52dc357cccD293549076a6b7757D'
const Cancun_CNTP_airdrop_updated_sc_readonly = new ethers.Contract(Cancun_CNTP_airdrop_updated_addr, Cancun_CNTP_airdorpABI, provode_Cancun)

const ecPool  = [new ethers.Contract(CoNET_DePIN_addr, CoNET_DePIN_ABI, managerWallet)]

const getTx = async (tx: string) => {
	return await provode_Cancun.getTransactionReceipt(tx)
}

interface transferData {
	toAddress: string
	value: ethers.BigNumberish
	hash: string
}

const _transfer = async () => {
	const data = transferPool.shift()
	if (!data) {
		return
	}

	const SC = ecPool.shift()
	if (!SC) {
		transferPool.unshift(data) 
		return
	}
	
	try {
		const tx = await SC.airdropFromCancun(data.toAddress, data.value, data.hash)
		const kk = await tx.wait()
		logger(Colors.blue(`airDrop ${data.toAddress} ${ethers.formatEther(data.value)} success! hash = ${tx.hash}`))
	} catch (ex: any) {
		logger(Colors.red(`CoNETDePINMainchainBridgeSC.airDrop Error! ${ex.message}`))
		transferPool.unshift(data)
	}
	ecPool.push(SC)
	_transfer()
}



const transferPool: transferData[] = []

const checkCNTPTransfer = async (tR: ethers.TransactionReceipt) => {
	
	for (let log of tR.logs) {
		const LogDescription = Cancun_CNTP_airdrop_updated_sc_readonly.interface.parseLog(log)
		
		if (LogDescription?.name === 'bridgeTo') {
			const toAddress  = LogDescription.args[0]
			const value: ethers.BigNumberish = LogDescription.args[1]
			const hash = tR.hash
	
			const obj = {toAddress, value, hash}
			logger(inspect(obj, false, 3, true))
			transferPool.push (obj)
			_transfer()
		} else {
			logger(LogDescription?.name)
		}
	}
}


const CancunBlockListenning = async (block: number) => {
	
	const blockTs = await provode_Cancun.getBlock(block)
	
	if (!blockTs?.transactions) {
		return logger(Colors.gray(`holeskyBlockListenning ${block} has none`))
	}

	logger(Colors.gray(`holeskyBlockListenning START ${block}`))

	for (let tx of blockTs.transactions) {

		const event = await getTx(tx)
		if ( event?.to?.toLowerCase() === Cancun_CNTP_airdrop_updated_addr) {
			
			checkCNTPTransfer(event)
		}
		
	}
}



let currentBlock = 0

const daemondStart = async () => {
	
	currentBlock = await provode_Cancun.getBlockNumber()
	logger(Colors.magenta(`CoNET DePIN airdrop daemon Start from block [${currentBlock}]`))
	provode_Cancun.on('block', async block => {
		if (block > currentBlock) {
			currentBlock = block
			CancunBlockListenning(block)
		}
		
	})
}
daemondStart()



