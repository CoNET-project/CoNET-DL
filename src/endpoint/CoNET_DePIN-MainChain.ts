import {JsonRpcProvider, Contract, Wallet, TransactionResponse, TransactionReceipt} from 'ethers'
import {logger, masterSetup} from '../util/util'
import CoNETDePINHoleskyABI from './CoNETDePINHolesky.json'
import CoNETDePINMainnetABI from './CoNETDePINMainnet.json'
import CONETDePIN_Airdrop from './CONETDePINBridge.json'
import Colors from 'colors/safe'
import {inspect} from 'node:util'

const CoNETMainChainRPC = 'http://38.102.126.53:8000'
const CoNETHoleskyRPC = 'https://rpc.conet.network'
const CoNETDePINMainchainSC = '0xc4C9927516db9BBe42DC0b003A7AB0946AC649C1'
const CoNETDePINHoleskySCAddress = '0xF837a46A0dD04dc27c46260d1C0cfC00628Ec517'.toLowerCase()
const CoNETDePINMainchainBridgeAddress = '0x242D503a29EaEF650615946A8C5eB2CD6c0164d6'

const endPointHolesky = new JsonRpcProvider(CoNETHoleskyRPC)
const endPointCoNETMainnet = new JsonRpcProvider(CoNETMainChainRPC)
const CoNETDepinHoleskyAdmin = new Wallet(masterSetup.conetDePINAdmin[0], endPointHolesky)
const CoNETDePINMainnetAdmin = new Wallet(masterSetup.conetDePINAdmin[0], endPointCoNETMainnet)
const CoNETDePINHoleskySC = new Contract(CoNETDePINHoleskySCAddress, CoNETDePINHoleskyABI, CoNETDepinHoleskyAdmin)
const CoNETDePINMainnetSC = new Contract(CoNETDePINMainchainSC, CoNETDePINMainnetABI, CoNETDePINMainnetAdmin)
const CoNETDePINMainchainBridgeSC = new Contract(CoNETDePINMainchainBridgeAddress, CONETDePIN_Airdrop, CoNETDePINMainnetAdmin)

const checkTransfer = async (tR: TransactionReceipt) => {
	for (let log of tR.logs) {
		const LogDescription = CoNETDePINHoleskySC.interface.parseLog(log)
		if (LogDescription?.name === 'bridgeTo') {
			const toAddress  = LogDescription.args[0]
			const value = LogDescription.args[1]
			const hash = tR.hash
			logger(Colors.magenta(`Bridge hash[${hash}] toAddress[${toAddress}] value[${value}]`))
			try {
				const tx = await CoNETDePINMainchainBridgeSC.airDrop(hash, toAddress, value)
				
				logger(inspect(tx))
			} catch (ex: any) {
				logger(Colors.red(`CoNETDePINMainchainBridgeSC.airDrop Error!`), ex.message)
			}
			
		}
	}
	
	
	
}

const holeskyBlockListenning = async (block: number) => {
	
	const blockTs = await endPointHolesky.getBlock(block)
	
	if (!blockTs?.transactions) {
        return logger(Colors.gray(`holeskyBlockListenning ${block} has none`))
    }

	for (let tx of blockTs.transactions) {

		const event = await getTx(tx)
		
		if ( event?.to?.toLowerCase() === CoNETDePINHoleskySCAddress) {
			return checkTransfer(event)
		}
		logger(Colors.gray(`holeskyBlockListenning ${block} has none of CoNETDePINHoleskySCAddress!`))
	}
}

const getTx = async (tx: string) => {
	return await endPointHolesky.getTransactionReceipt(tx)
}



const daemondStart = () => {
	
	endPointHolesky.on('block', async block => {
		holeskyBlockListenning(block)
	})
}

daemondStart()