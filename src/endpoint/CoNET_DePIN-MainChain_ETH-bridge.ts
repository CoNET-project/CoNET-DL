import {JsonRpcProvider, Contract, Wallet, TransactionResponse, TransactionReceipt, formatEther, BigNumberish} from 'ethers'
import {logger, masterSetup} from '../util/util'
import CONETDePIN_Eth_Bridge_ABI from './CoNETDePIN_Eth_bridge.json'
import CONETDePIN_Eth_Pool_ABI from './CoNET_DePIN-ETH-pool.json'
import CONETDePIN_Eth_Pool_ManagerABI from './CoNETDePIN-ETH-Manager.json'
import Colors from 'colors/safe'
import {inspect} from 'node:util'
import {mapLimit} from 'async'

const CoNETMainChainRPC = 'https://mainnet-rpc.conet.network'
const CoNETHoleskyRPC = 'https://rpc.conet.network'
const CoNETDePINMainchainSC = '0xc4C9927516db9BBe42DC0b003A7AB0946AC649C1'
const CoNETDePINHoleskySCAddress = '0xa0822b9fe34f81dd926ff1c182cb17baf50004f7'.toLowerCase()
const CoNETDePINMainchainBridgeAddress = '0x242D503a29EaEF650615946A8C5eB2CD6c0164d6'
const CoNET_Eth_MainChain_Pool = '0x9cCb8973D172733935bEE2dAEa6D0CdEa54B353B'
const CoNET_ETH_pool_Addr = '0x287CFe91c3779Ea9F495f7cf2cd88b438550c8D8'.toLowerCase()
const CoNETDePIN_Eth_bridge = '0x3162EE237BbeA6BbB583dBec9571F4eDEf84212B'.toLowerCase()

const CoNETDePIN_pool_Manager_Addr = '0xD9f2d81FF6ca7a172143FC9DE2aF23FcffD53dbf'

const endPointCoNETMainnet = new JsonRpcProvider(CoNETMainChainRPC)
const conetDePINEthAdmin = new Wallet (masterSetup.conetDePINEthAdmin[1], endPointCoNETMainnet)


const CONETDePIN_Eth_PoolSC = new Contract(CoNETDePIN_Eth_bridge, CONETDePIN_Eth_Pool_ABI, endPointCoNETMainnet)
const CoNETDePIN_pool_ManagerSC = new Contract(CoNETDePIN_pool_Manager_Addr, CONETDePIN_Eth_Pool_ManagerABI, conetDePINEthAdmin)

interface transferData {
	toAddress: string
	value: BigNumberish
	hash: string
}

const sss = new Promise(resolve=> {
	setTimeout(() => {

	})
})

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
		const tx = await CoNETDePIN_pool_ManagerSC.makeExitTx(data.hash, data.toAddress, data.value)
		const kk = await tx.wait()
		logger(Colors.blue(`ETH Bridge [${Colors.green(data.hash)}] success $${Colors.green(formatEther(data.value))} to [${Colors.green(data.toAddress)}]`))
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
        return logger(Colors.gray(`mainnetBlockListenning transactions ${block} has none`))
    }
	logger(Colors.gray(`mainnetBlockListenning START ${block}`))

	for (let tx of blockTs.transactions) {

		const event = await getTx(tx)
		if ( event?.to?.toLowerCase() === CoNET_ETH_pool_Addr) {
			checkTransfer(event)
		}
		
	}
}

const getTx = async (tx: string) => {
	return await endPointCoNETMainnet.getTransactionReceipt(tx)
}

const daemondStart = () => {
	logger(Colors.magenta(`ETH Bridge start with manager wallet ${conetDePINEthAdmin.address}`))
	setTimeout(() => {
		
	}, 12 * 1000)
}


daemondStart()