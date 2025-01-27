import {JsonRpcProvider, Contract, Wallet, TransactionResponse} from 'ethers'
import {logger, masterSetup} from '../util/util'
import CoNETDePINHoleskyABI from './CoNETDePINHolesky.json'
import CoNETDePINMainnetABI from './CoNETDePINMainnet.json'
import Colors from 'colors/safe'
import {inspect} from 'node:util'

const CoNETMainChainRPC = 'http://38.102.126.53:8000'
const CoNETHoleskyRPC = 'https://rpc.conet.network'
const CoNETDePINMainchainSC = '0xc4C9927516db9BBe42DC0b003A7AB0946AC649C1'
const CoNETDePINHoleskySCAddress = '0x05ad832e81b703FaeA855476788bdBdBc4897F14'.toLowerCase()
const endPointHolesky = new JsonRpcProvider(CoNETHoleskyRPC)
const endPointCoNETMainnet = new JsonRpcProvider(CoNETMainChainRPC)
const CoNETDepinHoleskyAdmin = new Wallet(masterSetup.conetDePINAdmin[0], endPointHolesky)
const CoNETDePINMainnetAdmin = new Wallet(masterSetup.conetDePINAdmin[0], endPointCoNETMainnet)
const CoNETDePINHoleskySC = new Contract(CoNETDePINHoleskySCAddress, CoNETDePINHoleskyABI, CoNETDepinHoleskyAdmin)
const  CoNETDePINMainnetSC = new Contract(CoNETDePINMainchainSC, CoNETDePINMainnetABI, CoNETDePINMainnetAdmin)


const checkTransfer = async (tR: TransactionResponse) => {

	
}

const holeskyBlockListenning = async (block: number) => {
	
	const blockTs = await endPointHolesky.getBlock(block)

	if (!blockTs?.transactions) {
        return 
    }

	for (let tx of blockTs.transactions) {

		const event = await getTx(tx)
		
		if ( event?.to?.toLowerCase() === CoNETDePINHoleskySCAddress) {
			checkTransfer(event)
		}
		
	}
}

const getTx = async (tx: string) => {
	return await endPointHolesky.getTransaction(tx)
}



const daemondStart = () => {
	endPointHolesky.on('block', async block => {
		holeskyBlockListenning(block)

	})
}


const start = async () => {
	const kk = await getTx('0xe2e7e0356b54e77eb024f8ae9dd9fa4e3ccf84e0a4731c973e3dacd0168c30b8')
	logger(inspect(kk, false, 3, true))
}

start()