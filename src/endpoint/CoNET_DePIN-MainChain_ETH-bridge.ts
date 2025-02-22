import {JsonRpcProvider, Contract, Wallet, TransactionResponse, TransactionReceipt, formatEther, BigNumberish, WebSocketProvider} from 'ethers'
import {logger, masterSetup} from '../util/util'
import CONETDePIN_Eth_Bridge_ABI from './CoNETDePIN_Eth_bridge.json'
import CONETDePIN_Eth_Pool_ABI from './CoNET_DePIN-ETH-pool.json'
import CONETDePIN_Eth_Pool_ManagerABI from './CoNETDePIN-ETH-Manager.json'
import Colors from 'colors/safe'
import {inspect} from 'node:util'
import {mapLimit} from 'async'

const ethEndpoint = masterSetup.ethEndpoint
const CoNETMainChainRPC = 'https://mainnet-rpc.conet.network'

const CoNET_mainnet_ETH_manager = '0x5E85A3D29eb6bAEf922810df1938807eb28cE124'.toLowerCase()


const endPointCoNETMainnet = new JsonRpcProvider(CoNETMainChainRPC)
const ethProvider = new JsonRpcProvider(ethEndpoint)

const CONETDePIN_Eth_PoolSC_readonly = new Contract(CoNET_mainnet_ETH_manager, CONETDePIN_Eth_Pool_ABI, endPointCoNETMainnet)

interface transferData {
	toAddress: string
	value: BigNumberish
	hash: string
}

const transferPool: transferData[] = []

const SC_pool: Contract[] = []

const voteGasprice = (gasPrice: number, block: number) => new Promise(async resolve=> {
	const SC = SC_pool.shift()
	if (!SC) {
		resolve(false)
		return logger(Colors.magenta(`voteGasprice has no SC to start SC_pool = ${SC_pool.length} Pool length = ${transferPool.length}\n`))
	}
	try {
		const tx = await SC.voteGasFees(gasPrice, block)
		await tx.wait()
		logger(Colors.magenta(`voteGasprice success! ${tx.hash}`))
	} catch (ex: any) {
		logger(Colors.red(`voteGasprice Error! ${ex.message}`))
	}

	SC_pool.unshift(SC)
	resolve (true)
})

const _transfer = async () => {

	const data = transferPool.shift()
	if (!data) {
		return
	}

	const SC = SC_pool.shift()
	if (!SC) {
		transferPool.unshift(data)
		return logger(Colors.magenta(`_transfer has no SC to start SC_pool = ${SC_pool.length} Pool length = ${transferPool.length}\n`))
	}

	logger(Colors.magenta(`_transfer Pool length = ${transferPool.length}\n`), inspect(data, false, 3, true))

	try {
		const tx = await SC.voteTx(data.hash, data.toAddress, data.value)
		const kk = await tx.wait()
		logger(Colors.blue(`ETH Bridge ${tx.hash} [${Colors.green(data.hash)}] success $${Colors.green(formatEther(data.value))} to client [${Colors.green(data.toAddress)}]`))
	} catch (ex: any) {
		logger(Colors.red(`CoNETDePINMainchainBridgeSC makeExitTx Error! ${ex.message}`))
	}
	SC_pool.push(SC)
	_transfer()
}

const checkTransfer = async (tR: TransactionReceipt) => {
	
	for (let log of tR.logs) {
		const LogDescription = CONETDePIN_Eth_PoolSC_readonly.interface.parseLog(log)
		if (LogDescription?.name === 'Received') {
			const toAddress  = LogDescription.args[0]
			const value: BigNumberish = LogDescription.args[1]
			const hash = tR.hash
			transferPool.push ({toAddress, value, hash})
			_transfer()
		}
	}
	
}

const bridgeBlockListenning = async (block: number) => {
	
	const blockTs = await endPointCoNETMainnet.getBlock(block)
	
	if (!blockTs?.transactions) {
        return logger(Colors.gray(`mainnet ETH BlockListenning ${block} has none`))
    }
	logger(Colors.gray(`mainnetBlockListenning START ${block}`))

	for (let tx of blockTs.transactions) {

		const event = await getTx(tx)
		if ( event?.to?.toLowerCase() === CoNET_mainnet_ETH_manager) {
			checkTransfer(event)
		}
		
	}
}


const getTx = async (tx: string) => {
	return await endPointCoNETMainnet.getTransactionReceipt(tx)
}

let gasPrice = 0
const daemondStart = async () => {
	const conetDePINEthAdmin = new Wallet (masterSetup.ETH_Manager[voteAccount], endPointCoNETMainnet)
	const CoNETDePIN_pool_ManagerSC = new Contract(CoNET_mainnet_ETH_manager, CONETDePIN_Eth_Pool_ManagerABI, conetDePINEthAdmin)
	gasPrice = parseInt((await CoNETDePIN_pool_ManagerSC.otherSideGAS()).toString())
	SC_pool.push(CoNETDePIN_pool_ManagerSC)
	logger(Colors.magenta(`ETH Bridge start with manager wallet ${conetDePINEthAdmin.address} gasFee = ${gasPrice}`))

	endPointCoNETMainnet.on('block', block => {
		bridgeBlockListenning (block)
	})

	ethProvider.on('block', async block => {
		const feeObj = await ethProvider.getFeeData()
		
		if (!feeObj.gasPrice) {
			
			return logger(Colors.red(`transferProcess start with GAS NULL ERROR `), inspect(feeObj, false, 3, true))
		}

		logger(inspect(feeObj, false, 3, true))
		const _gasPrice = parseInt(feeObj.gasPrice.toString())
		if (Math.abs( _gasPrice - gasPrice)*100/gasPrice > 1) {
			gasPrice = _gasPrice
			logger(Colors.magenta(`Gas price over ${Math.abs( _gasPrice - gasPrice)*100/gasPrice} block number = ${block}`))
			voteGasprice(_gasPrice, block)
		}
	})

}


let voteAccount = -1

const [,,...args] = process.argv
args.forEach ((n, index ) => {
	if (/^n\=/i.test(n)) {
		voteAccount = parseInt(n.split('=')[1])
		if ( !isNaN(voteAccount) && voteAccount > -1 ) {
			daemondStart()
		}
		
	}
})
