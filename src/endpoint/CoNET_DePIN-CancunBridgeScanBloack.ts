import ethers, {JsonRpcProvider, Contract, Wallet, TransactionResponse, TransactionReceipt, formatEther, BigNumberish} from 'ethers'
import {logger, masterSetup} from '../util/util'
import CONETDePIN_Airdrop from './CNTPairdrop.json'
import Colors from 'colors/safe'
import {inspect} from 'node:util'
import Cancun_CNTP_airdorpABI from '../util/Cancun_CNTP_airdorpABI.json'
import CoNETDePIN_mainnet_airdropABI from './CoNET_DePIN_Mainnet_airdrop_SC.json'
import CONET_Point_ABI from '../util/cCNTP.json'
import {mapLimit} from 'async'

import CoNET_DePIN_ABI from './CoNET_DePIN.json'

const CoNET_DePIN_addr = '0xc4D5cc27026F52dc357cccD293549076a6b7757D'


const CoNETMainChainRPC = 'https://mainnet-rpc.conet.network'
const CoNET_CancunRPC = 'https://cancun-rpc.conet.network'
const CoNETDePINMainchainSC = '0xc4C9927516db9BBe42DC0b003A7AB0946AC649C1'
const CoNETDePINMainchainBridgeAddress = '0xf093e5534dBd1E1fB52E29E5432C503876E658C2'

const CoNETDePINCancunSCAddress = '0x8A8898960B45AEa683b36EB214422740cb19fD06'.toLowerCase()

const CNTPCancun_addr = '0x6C7C575010F86A311673432319299F3D68e4b522'.toLowerCase()

const endPointCancun = new JsonRpcProvider(CoNET_CancunRPC)
const endPointCoNETMainnet = new JsonRpcProvider(CoNETMainChainRPC)

const CoNETDePINMainnetAdmin = new Wallet(masterSetup.conetDePINAdmin[0], endPointCoNETMainnet)
const CoNETDePIN_CNTP_Bridge_Event_readonly = new Contract(CoNETDePINCancunSCAddress, Cancun_CNTP_airdorpABI, endPointCancun)

const CoNETDePINMainchainBridgeSC = new Contract(CoNETDePINMainchainBridgeAddress, CONETDePIN_Airdrop, CoNETDePINMainnetAdmin)
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
	logger(`manager address ${wa.address}`)
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
		logger(Colors.blue(`waitingList ${transferPool.length} airDrop ${data.toAddress} ${formatEther(data.value)} success! hash = ${tx.hash}` ))
	} catch (ex: any) {
		logger(Colors.red(`CoNETDePINMainchainBridgeSC.airDropairDrop ${data.toAddress} ${formatEther(data.value)} success! hash = ${data.hash}  Error! ${ex.message}`))
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
			const value: BigNumberish = LogDescription.args[1]
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

const checkCNTPTransfer = async (tR: TransactionReceipt) => {
	
	for (let log of tR.logs) {
		const LogDescription = CNTP_Sc_readonly.interface.parseLog(log)
		
		if (LogDescription?.name === 'Transfer' && LogDescription.args[1] == '0x0000000000000000000000000000000000000000') {
			const toAddress  = LogDescription.args[0]
			const _value: BigNumberish = LogDescription.args[2]
			const hash = tR.hash
			const value = ethers.parseEther((parseFloat(ethers.formatEther(_value))/200).toString())
			const obj = {toAddress, value, hash}

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

		if ( event?.to?.toLowerCase() === CNTPCancun_addr) {
			
			checkCNTPTransfer(event)
		}
		
	}
}

const getTx = async (tx: string) => {
	return await endPointCancun.getTransactionReceipt(tx)
}
//		71534
const start_block = 86182
const stop_block = 71534

const blockArray: number[] = []
logger(Colors.magenta(`Scan started from ${start_block} ~ ${stop_block}`))
if (start_block > stop_block) {
	for (let i = start_block; i > stop_block; i --) {
		blockArray.push(i)
	}

} else {
	for (let i = start_block; i < stop_block; i ++) {
		blockArray.push(i)
	}
}


// mapLimit(blockArray, 1, async (n, next) => {
// 	await CancunBlockListenning(n)
// }, err => {
// 	logger(Colors.red(`Scan end!`))
// })

