import ethers, {JsonRpcProvider, Contract, Wallet, TransactionResponse, TransactionReceipt, formatEther, BigNumberish} from 'ethers'
import {logger, masterSetup} from '../util/util'
import Colors from 'colors/safe'
import {inspect} from 'node:util'
import CONET_Point_ABI from '../util/cCNTP.json'

import CoNET_DePIN_ABI from './CoNET_DePIN.json'

const CoNET_DePIN_addr = '0xc4D5cc27026F52dc357cccD293549076a6b7757D'

const CoNETMainChainRPC = 'https://mainnet-rpc.conet.network'
const CoNET_CancunRPC = 'https://cancun-rpc.conet.network'


const CNTPCancun_addr = '0x6C7C575010F86A311673432319299F3D68e4b522'.toLowerCase()

const endPointCancun = new JsonRpcProvider(CoNET_CancunRPC)
const endPointCoNETMainnet = new JsonRpcProvider(CoNETMainChainRPC)


const CNTP_Sc_readonly = new Contract(CNTPCancun_addr, CONET_Point_ABI, endPointCancun)

interface transferData {
	toAddress: string
	value: BigNumberish
	hash: string
}

const transferPool: transferData[] = []

const ecPool: Contract[] = []
for (let _wa of masterSetup.newFaucetAdmin) {
	const wa = new Wallet(_wa, endPointCoNETMainnet)
	const sc = new Contract(CoNET_DePIN_addr, CoNET_DePIN_ABI, wa)
	ecPool.push(sc)
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
		logger(Colors.blue(`airDrop ${data.toAddress} ${formatEther(data.value)} success! hash = ${tx.hash}`))
	} catch (ex: any) {
		logger(Colors.red(`CoNETDePINMainchainBridgeSC.airDrop Error! ${ex.message}`))
	}
	ecPool.push(SC)
	_transfer()
}



const checkCNTPTransfer = async (tR: TransactionReceipt) => {
	
	for (let log of tR.logs) {
		const LogDescription = CNTP_Sc_readonly.interface.parseLog(log)
		
		logger(inspect(LogDescription, false, 3, true))
		if (LogDescription?.name === 'Transfer' && LogDescription.args[1] == '0x0000000000000000000000000000000000000000') {
			const toAddress  = LogDescription.args[0]
			const _value: BigNumberish = LogDescription.args[2]
			const hash = tR.hash
			
			const value = ethers.parseEther((parseFloat(ethers.formatEther(_value))/200).toString())
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
	
	const blockTs = await endPointCancun.getBlock(block)
	
	if (!blockTs?.transactions) {
        return logger(Colors.gray(`holeskyBlockListenning ${block} has none`))
    }

	logger(Colors.gray(`holeskyBlockListenning START ${block}`))

	for (let tx of blockTs.transactions) {

		const event = await getTx(tx)
		// if ( event?.to?.toLowerCase() === CoNETDePINCancunSCAddress) {
		// 	checkTransfer(event)
		// }

		if ( event?.to?.toLowerCase() === CNTPCancun_addr) {
			
			checkCNTPTransfer(event)
		}
		
	}
}

const getTx = async (tx: string) => {
	return await endPointCancun.getTransactionReceipt(tx)
}



let currentBlock = 0

const daemondStart = async () => {
	
	currentBlock = await endPointCancun.getBlockNumber()
	logger(Colors.magenta(`CoNET DePIN airdrop daemon Start from block [${currentBlock}]`))
	endPointCancun.on('block', async block => {
		if (block > currentBlock) {
			currentBlock = block
			CancunBlockListenning(block)
		}
		
	})
}


daemondStart()

