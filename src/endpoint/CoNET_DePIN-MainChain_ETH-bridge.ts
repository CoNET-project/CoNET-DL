import {JsonRpcProvider, Contract, Wallet, TransactionResponse, TransactionReceipt, formatEther, BigNumberish, WebSocketProvider} from 'ethers'
import {logger, masterSetup} from '../util/util'
import CONETDePIN_Eth_Bridge_ABI from './CoNETDePIN_Eth_bridge.json'
import CONETDePIN_Eth_Pool_ABI from './CoNET_DePIN-ETH-pool.json'
import CONETDePIN_Eth_Pool_ManagerABI from './CoNETDePIN-ETH-Manager.json'
import Colors from 'colors/safe'
import {inspect} from 'node:util'
import {mapLimit} from 'async'

const CoNETMainChainRPC = 'https://mainnet-rpc.conet.network'

const CoNET_mainnet_ETH_pool_Addr = '0x82b056fEd31974e024e94b829bCe1986D912DFb8'.toLowerCase()

const CoNETDePIN_pool_Manager_Addr = '0x98F981930357B76b3520584616DC3Dbb166B84F9'

const endPointCoNETMainnet = new JsonRpcProvider(CoNETMainChainRPC)


const CONETDePIN_Eth_PoolSC = new Contract(CoNET_mainnet_ETH_pool_Addr, CONETDePIN_Eth_Pool_ABI, endPointCoNETMainnet)

interface transferData {
	toAddress: string
	value: BigNumberish
	hash: string
}

const transferPool: transferData[] = []

const SC_pool: Contract[] = []
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
	const conetDePINEthAdmin = new Wallet (masterSetup.ETH_Manager[voteAccount], endPointCoNETMainnet)
	const CoNETDePIN_pool_ManagerSC = new Contract(CoNETDePIN_pool_Manager_Addr, CONETDePIN_Eth_Pool_ManagerABI, conetDePINEthAdmin)
	SC_pool.push(CoNETDePIN_pool_ManagerSC)
	logger(Colors.magenta(`ETH Bridge start with manager wallet ${conetDePINEthAdmin.address}`))

	endPointCoNETMainnet.on('block', block => {
		bridgeBlockListenning (block)
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
