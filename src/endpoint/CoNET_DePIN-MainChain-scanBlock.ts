import {JsonRpcProvider, Contract, Wallet, TransactionResponse, TransactionReceipt, formatEther, BigNumberish} from 'ethers'
import {logger, masterSetup} from '../util/util'
import CoNETDePINHoleskyABI from './CoNETDePINHolesky.json'
import CONETDePIN_Airdrop from './CNTPairdrop.json'
import Colors from 'colors/safe'
import {inspect} from 'node:util'
import {mapLimit} from 'async'
const CoNETMainChainRPC = 'http://38.102.126.53:8887'
const CoNETHoleskyRPC = 'https://rpc.conet.network'
const CoNETDePINMainchainSC = '0xc4C9927516db9BBe42DC0b003A7AB0946AC649C1'
const CoNETDePINHoleskySCAddress = '0xa0822b9fe34f81dd926ff1c182cb17baf50004f7'.toLowerCase()
const CoNETDePINMainchainBridgeAddress = '0x673d6632A80eAD21ceA3B80cBc60a706F91bACa8'

const endPointHolesky = new JsonRpcProvider(CoNETHoleskyRPC)
const endPointCoNETMainnet = new JsonRpcProvider(CoNETMainChainRPC)

const CoNETDepinHoleskyAdmin = new Wallet(masterSetup.conetDePINAdmin_scan[1], endPointHolesky)

const CoNETDePINHoleskySC = new Contract(CoNETDePINHoleskySCAddress, CoNETDePINHoleskyABI, CoNETDepinHoleskyAdmin)
const workSC: Contract[] = []


for (let i = 0; i < masterSetup.conetDePINAdmin_scan.length; i ++ ) {
	const wallet = new Wallet(masterSetup.conetDePINAdmin_scan[i], endPointCoNETMainnet)
	workSC.push(new Contract(CoNETDePINMainchainBridgeAddress, CONETDePIN_Airdrop, wallet))
}

interface transferData {
	toAddress: string
	value: BigNumberish
	hash: string
}
const transferPool: transferData[] = []

const _transfer = async () => {

	const CoNETDePINMainchainBridgeSC = workSC.shift()

	if (!CoNETDePINMainchainBridgeSC) {
		return
	}

	const data = transferPool.shift()
	if (!data) {
		workSC.unshift(CoNETDePINMainchainBridgeSC)
		return
	}
	
	logger(inspect(data, false, 3, true))
	try {
		const tx = await CoNETDePINMainchainBridgeSC.airDrop(data.hash, data.toAddress, data.value)
		//const kk = await tx.wait()
		logger(Colors.magenta(`_transfer ${ data.toAddress} => ${formatEther(data.value)} success! tx = ${tx.hash} waiting list has ${Colors.green(transferPool.length.toString())}`))
	} catch (ex: any) {

		logger(Colors.red(`CoNETDePINMainchainBridgeSC.airDrop Error! ${ex.message}`))
	}
	workSC.unshift(CoNETDePINMainchainBridgeSC)
	_transfer()
}


const checkTransfer = async (tR: TransactionReceipt) => {
	for (let log of tR.logs) {
		const LogDescription = CoNETDePINHoleskySC.interface.parseLog(log)
		if (LogDescription?.name === 'bridgeTo') {
			const toAddress  = LogDescription.args[0]
			const value: BigNumberish = LogDescription.args[1]
			const hash = tR.hash
			transferPool.push ({toAddress, value, hash})
			_transfer()
			
		} else {
			logger(LogDescription?.name)
		}
	}
	
}

const holeskyBlockListenning = async (block: number) => {
	
	const blockTs = await endPointHolesky.getBlock(block)
	
	if (!blockTs?.transactions) {
        return logger(Colors.gray(`holeskyBlockListenning ${block} has none`))
    }
	logger(Colors.gray(`holeskyBlockListenning START ${block}`))

	for (let tx of blockTs.transactions) {

		const event = await getTx(tx)
		
		if ( event?.to?.toLowerCase() === CoNETDePINHoleskySCAddress) {
			checkTransfer(event)
		} 
		
	}
}

const getTx = async (tx: string) => {
	return await endPointHolesky.getTransactionReceipt(tx)
}


const start_block = 1201021
const stop_block = 1204768

const blockArray: number[] = []
logger(Colors.magenta(`Scan started from ${start_block} ~ ${stop_block}`))

for (let i = start_block;i < stop_block; i ++) {
	blockArray.push(i)
}

mapLimit(blockArray, 1, async (n, next) => {
	await holeskyBlockListenning(n)
}, err => {
	logger(Colors.red(`Scan end!`))
})