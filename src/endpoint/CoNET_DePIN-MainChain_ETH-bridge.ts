import {JsonRpcProvider, Contract, Wallet, TransactionResponse, TransactionReceipt} from 'ethers'
import {logger, masterSetup} from '../util/util'
import CONETDePIN_Eth_Bridge_ABI from './CoNETDePIN_Eth_bridge.json'
import Colors from 'colors/safe'
import {inspect} from 'node:util'
import {mapLimit} from 'async'

const CoNETMainChainRPC = 'https://mainnet-rpc.conet.network'
const CoNETHoleskyRPC = 'https://rpc.conet.network'
const CoNETDePINMainchainSC = '0xc4C9927516db9BBe42DC0b003A7AB0946AC649C1'
const CoNETDePINHoleskySCAddress = '0xa0822b9fe34f81dd926ff1c182cb17baf50004f7'.toLowerCase()
const CoNETDePINMainchainBridgeAddress = '0x242D503a29EaEF650615946A8C5eB2CD6c0164d6'

const CoNETDePIN_Eth_bridge = '0x3162EE237BbeA6BbB583dBec9571F4eDEf84212B'.toLowerCase()

const endPointCoNETMainnet = new JsonRpcProvider(CoNETMainChainRPC)
const conetDePINEthAdmin = new Wallet (masterSetup.conetDePINEthAdmin[0], endPointCoNETMainnet)

const CONETDePIN_Eth_BridgeSC = new Contract(CoNETDePIN_Eth_bridge, CONETDePIN_Eth_Bridge_ABI, conetDePINEthAdmin)
conetDePINEthAdmin

interface transferData {
	toAddress: string
	value: BigInt
	hash: string
}

const transferPool: transferData[] = []
let transferProcess = false


const checkTransfer = async (tR: TransactionReceipt) => {
	
	for (let log of tR.logs) {
		const LogDescription = CONETDePIN_Eth_BridgeSC.interface.parseLog(log)
		if (LogDescription?.name === 'Received') {

			const toAddress  = LogDescription.args[0].toLowerCase()

			if (CoNETDePIN_Eth_bridge == toAddress) {
				const value: BigInt = LogDescription.args[1]
				const hash = tR.hash
				logger(Colors.magenta(`value = ${value} toAddress ${toAddress} hash ${hash}`))
			}
			// transferPool.push ({toAddress, value, hash})
		}
	}
	
}

const mainnetBlockListenning = async (block: number) => {
	
	const blockTs = await endPointCoNETMainnet.getBlock(block)
	
	if (!blockTs?.transactions) {
        return logger(Colors.gray(`mainnetBlockListenning transactions ${block} has none`))
    }
	logger(Colors.gray(`mainnetBlockListenning START ${block}`))

	for (let tx of blockTs.transactions) {

		const event = await getTx(tx)
		if ( event?.to?.toLowerCase() === CoNETDePIN_Eth_bridge) {
			checkTransfer(event)
		}
		
	}
}

const getTx = async (tx: string) => {
	return await endPointCoNETMainnet.getTransactionReceipt(tx)
}


const daemondStart = () => {
	
	endPointCoNETMainnet.on('block', async block => {
		mainnetBlockListenning(block)
	})
}




// mainnetBlockListenning(39956)

daemondStart()