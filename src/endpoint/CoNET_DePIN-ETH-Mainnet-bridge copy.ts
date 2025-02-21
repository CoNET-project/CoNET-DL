import {JsonRpcProvider, Contract, Wallet, TransactionResponse, TransactionReceipt, formatEther, BigNumberish} from 'ethers'
import {logger, masterSetup} from '../util/util'
import CONETDePIN_Eth_Bridge_ABI from './CoNETDePIN_Eth_bridge.json'
import CONETDePIN_Eth_Pool_ABI from './CoNET_DePIN-ETH-pool.json'
import CONETDePIN_Eth_Pool_ManagerABI from './CoNETDePIN-ETH-Manager.json'
import Colors from 'colors/safe'
import {inspect} from 'node:util'
import {mapLimit} from 'async'

const CoNETMainChainRPC = 'https://mainnet-rpc.conet.network'

const CoNET_mainnet_ETH_pool_Addr = '0xC9039A1eb88346E67879767908bF1924246430b6'.toLowerCase()

const CoNETDePIN_pool_Manager_Addr = '0xB5E80a3de71931F8B0EdB1A4dF524Ad2e09D108a'

const endPointCoNETMainnet = new JsonRpcProvider(CoNETMainChainRPC)
const conetDePINEthAdmin = new Wallet (masterSetup.ETH_Manager[0], endPointCoNETMainnet)


const CONETDePIN_Eth_PoolSC = new Contract(CoNET_mainnet_ETH_pool_Addr, CONETDePIN_Eth_Pool_ABI, endPointCoNETMainnet)

const CoNETDePIN_pool_ManagerSC = new Contract(CoNETDePIN_pool_Manager_Addr, CONETDePIN_Eth_Pool_ManagerABI, conetDePINEthAdmin)

interface transferData {
	toAddress: string
	value: BigNumberish
	hash: string
}

const transferPool: transferData[] = []
let transferProcess = false

const _transfer = async () => {
	if (transferProcess) {
		return
	}
	transferProcess = true
	const data = transferPool.shift()
	if (!data) {
		transferProcess = false
		return
	}

	logger(Colors.magenta(`_transfer Pool length = ${transferPool.length}\n`), inspect(data, false, 3, true))

	try {
		const tx = await CoNETDePIN_pool_ManagerSC.voteTx(data.hash, data.toAddress, data.value)
		const kk = await tx.wait()
		logger(Colors.blue(`ETH Bridge ${tx.hash} [${Colors.green(data.hash)}] success $${Colors.green(formatEther(data.value))} to client [${Colors.green(data.toAddress)}] with ${conetDePINEthAdmin.address}`))
	} catch (ex: any) {
		logger(Colors.red(`CoNETDePINMainchainBridgeSC makeExitTx Error! ${ex.message}`))
	}
	transferProcess = false
	_transfer()
}

const checkTransfer = async (tR: TransactionReceipt) => {
	
	for (let log of tR.logs) {
		const LogDescription = CONETDePIN_Eth_PoolSC.interface.parseLog(log)
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
		if ( event?.to?.toLowerCase() === CoNET_mainnet_ETH_pool_Addr) {
			checkTransfer(event)
		}
		
	}
}


const getTx = async (tx: string) => {
	return await endPointCoNETMainnet.getTransactionReceipt(tx)
}

const daemondStart = () => {
	logger(Colors.magenta(`ETH Bridge start with manager wallet ${conetDePINEthAdmin.address}`))
	endPointCoNETMainnet.on('block', block => {
		bridgeBlockListenning (block)
	})
}


daemondStart()