import {ethers} from 'ethers'
import {logger, masterSetup} from '../util/util'
import Colors from 'colors/safe'
import {inspect} from 'node:util'
import cancun_passport_airdrop_ABI from './cancun_passport_airdropABI.json'
import mainnet_passpost_airdropABI from './mainnet_passport_airdropABI.json'

const CoNETMainChainRPC = 'https://mainnet-rpc.conet.network'
const CoNET_CancunRPC = 'https://cancun-rpc.conet.network'

const endPointCancun = new ethers.JsonRpcProvider(CoNET_CancunRPC)
const cancun_passport_airdrop_addr = '0xe996e897bc088b840283cadafd75a856bea44730'.toLocaleLowerCase()
const endPointCoNETMainnet = new ethers.JsonRpcProvider(CoNETMainChainRPC)
const mainnet_passport_airdrop_addr = '0x81b6f44fAeED65Ca19d159d5a1376A66F0Dac41F'


const cancun_passport_airdrop_readonly = new ethers.Contract(cancun_passport_airdrop_addr, cancun_passport_airdrop_ABI, endPointCancun)

const getTx = async (tx: string) => {
	return await endPointCancun.getTransactionReceipt(tx)
}

interface transferData {
	toAddress: string
	value: number
	expiresDayes: number
}

const adminWallet = new ethers.Wallet(masterSetup.mainnet_passport_airdrop, endPointCoNETMainnet)
const adminSC = new ethers.Contract(mainnet_passport_airdrop_addr, mainnet_passpost_airdropABI, adminWallet)
const ecPool: ethers.Contract[] = []
const transferPool: transferData[] = []

ecPool.push (adminSC)

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
		let tx: any
		if (data.expiresDayes == 0) {
			tx = await SC.GuardianAirdrop(data.toAddress, data.value)
		} else {
			tx = await SC.CONETianAirdrop(data.toAddress, data.value)
		}
		
		await tx.wait()
		logger(Colors.blue(`Passport airDrop ${data.toAddress} ${data.value} success! hash = ${tx.hash}  waiting list = [${transferPool.length}]`))
	} catch (ex: any) {
		if (!/hasn't available/.test(ex.message) ) {
			logger(Colors.red(`Passport airDrop Error! ${ex.message}`))
			transferPool.unshift(data)
		}
		
	}
	ecPool.push(SC)
	_transfer()
}

const checkCNTPTransfer = async (tR: ethers.TransactionReceipt) => {
	
	for (let log of tR.logs) {
		const LogDescription = cancun_passport_airdrop_readonly.interface.parseLog(log)
		
		if (LogDescription?.name === '_GuardianAirdrop') {
			const toAddress  = LogDescription.args[0]
			const _value: ethers.BigNumberish = LogDescription.args[1]
			const expiresDayes = 0
			const value = parseInt(_value.toString())/5
			
			const obj: transferData = {toAddress, value, expiresDayes}
			logger(inspect(obj, false, 3, true))
			transferPool.push (obj)
			
		} else if (LogDescription?.name === '_CONETianAirdrop') {
			const toAddress  = LogDescription.args[0]
			const _value: ethers.BigNumberish = LogDescription.args[1]
			const expiresDayes = 365
			const value = parseInt(_value.toString())/5
			const obj: transferData = {toAddress, value, expiresDayes}
			transferPool.push (obj)
		}
		_transfer()
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

		if ( event?.to?.toLowerCase() === cancun_passport_airdrop_addr) {
			
			checkCNTPTransfer(event)
		}
		
	}
}

let currentBlock = 0

const daemondStart = async () => {
	
	currentBlock = await endPointCancun.getBlockNumber()
	logger(Colors.magenta(`CoNET DePIN passport airdrop daemon Start from block [${currentBlock}]`))
	endPointCancun.on('block', async block => {
		if (block > currentBlock) {
			currentBlock = block
			CancunBlockListenning(block)
		}
		
	})
}
CancunBlockListenning(178699)
// daemondStart()