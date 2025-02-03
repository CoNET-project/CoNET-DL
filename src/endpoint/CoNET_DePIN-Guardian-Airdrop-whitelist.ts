import { JsonRpcProvider, Contract, Wallet, TransactionResponse, TransactionReceipt } from 'ethers'
import { logger, masterSetup } from '../util/util'
import CoNETDePINHoleskyABI from './CoNETDePINHolesky.json'
import { mapLimit } from 'async'
import Colors from 'colors/safe'


const CoNETHoleskyRPC = 'https://rpc.conet.network'

const CoNETDePINHoleskySCAddress = '0xa0822b9fe34f81dd926ff1c182cb17baf50004f7'.toLowerCase()


const endPointHolesky = new JsonRpcProvider(CoNETHoleskyRPC)
const CoNETDepinHoleskyAdmin = new Wallet(masterSetup.initManager[1], endPointHolesky)

const CoNETDePINHoleskySC = new Contract(CoNETDePINHoleskySCAddress, CoNETDePINHoleskyABI, CoNETDepinHoleskyAdmin)
const wallets: string[] = [
]

const start = () => {
	logger(Colors.magenta(`started total wallets = ${wallets.length}`))
	let i = 0
	mapLimit(wallets, 1, async (n, next) => {
		try {
			const tx = await CoNETDePINHoleskySC.changeWhiteList(n, false)
			const ts = await tx.wait()
			logger(Colors.blue(`[${++i}] => ${n} success!`))
		} catch (ex: any) {
			logger(Colors.red(`CoNETDePINHoleskySC.changeWhiteList error! ${ex.message}`))
		}
	})
}

start()