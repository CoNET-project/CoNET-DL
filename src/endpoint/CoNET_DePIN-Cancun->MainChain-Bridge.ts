import {JsonRpcProvider, Contract, Wallet, TransactionResponse, TransactionReceipt} from 'ethers'
import {logger, masterSetup} from '../util/util'
import CONETDePIN_Airdrop from './CNTPairdrop.json'
import Colors from 'colors/safe'
import {inspect} from 'node:util'
import Cancun_CNTP_airdorpABI from '../util/Cancun_CNTP_airdorpABI.json'
import CoNETDePIN_mainnet_airdropABI from './CoNET_DePIN_Mainnet_airdrop_SC.json'

const CoNETMainChainRPC = 'https://mainnet-rpc.conet.network'
const CoNET_CancunRPC = 'https://cancun-rpc.conet.network'
const CoNETDePINMainchainSC = '0xc4C9927516db9BBe42DC0b003A7AB0946AC649C1'
const CoNETDePINMainchainBridgeAddress = '0x673d6632A80eAD21ceA3B80cBc60a706F91bACa8'

const CoNETDePINCancunSCAddress = '0x8A8898960B45AEa683b36EB214422740cb19fD06'.toLowerCase()

const endPointCancun = new JsonRpcProvider(CoNET_CancunRPC)
const endPointCoNETMainnet = new JsonRpcProvider(CoNETMainChainRPC)

const CoNETDePINMainnetAdmin = new Wallet(masterSetup.conetDePINAdmin[0], endPointCoNETMainnet)
const CoNETDePIN_CNTP_Bridge_Event_readonly = new Contract(CoNETDePINCancunSCAddress, Cancun_CNTP_airdorpABI, endPointCancun)

const CoNETDePINMainchainBridgeSC = new Contract(CoNETDePINMainchainBridgeAddress, CONETDePIN_Airdrop, CoNETDePINMainnetAdmin)

interface transferData {
	toAddress: string
	value: BigInt
	hash: string
}

const transferPool: transferData[] = []

const ecPool: Contract[] = []
for (let _wa of masterSetup.newFaucetAdmin) {
	const wa = new Wallet(_wa, endPointCoNETMainnet)
	const sc = new Contract(CoNETDePINMainchainBridgeAddress, CoNETDePIN_mainnet_airdropABI, wa)
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
		const tx = await SC.airdrop(data.toAddress, data.value, data.hash)
		const kk = await tx.wait()
		logger(inspect(kk, false, 3, true))
	} catch (ex: any) {
		logger(Colors.red(`CoNETDePINMainchainBridgeSC.airDrop Error! ${ex.message}`))
	}
	ecPool.push(SC)
	_transfer()
}


const checkTransfer = async (tR: TransactionReceipt) => {

	for (let log of tR.logs) {
		const LogDescription = CoNETDePIN_CNTP_Bridge_Event_readonly.interface.parseLog(log)
		logger(`${LogDescription?.name}`)
		if (LogDescription?.name === 'bridgeTo') {
			const toAddress  = LogDescription.args[0]
			const value: BigInt = LogDescription.args[1]
			const hash = tR.hash
			const obj = {toAddress, value, hash}
			transferPool.push (obj)
			logger(inspect(obj, false, 3, true))
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
		
		if ( event?.to?.toLowerCase() === CoNETDePINCancunSCAddress) {
			checkTransfer(event)
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

// daemondStart()

CancunBlockListenning(72123)