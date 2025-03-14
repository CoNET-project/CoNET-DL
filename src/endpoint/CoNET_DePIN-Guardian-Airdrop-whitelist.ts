import { JsonRpcProvider, Contract, Wallet, TransactionResponse, TransactionReceipt } from 'ethers'
import { logger, masterSetup } from '../util/util'
import { mapLimit } from 'async'
import Colors from 'colors/safe'
import Cancun_CNTP_airdorpABI from '../util/Cancun_CNTP_airdorpABI.json'
import {readFile} from 'node:fs'

const CoNETCancunRPC = 'https://cancun-rpc.conet.network'

const CoNETDePINCancunSCAddress = '0x8A8898960B45AEa683b36EB214422740cb19fD06'


const endPointHolesky = new JsonRpcProvider(CoNETCancunRPC)
const CoNETDepinHoleskyAdmin = new Wallet(masterSetup.guardianReferralAdmin[0], endPointHolesky)
logger(`CoNETDepinHoleskyAdmin address = ${CoNETDepinHoleskyAdmin.address}`)
const CoNETDePINHoleskySC = new Contract(CoNETDePINCancunSCAddress, Cancun_CNTP_airdorpABI, CoNETDepinHoleskyAdmin)
let wallets: string[] = [
]
const startFile = async (fileName: string) => {
	return readFile(fileName, (err, data) => {
		if (err) {
			return logger(err)
		}
		const _wallets: string[] = data.toString().split('\n')
		wallets = _wallets
		start()
		
	})
}
const start = () => {
	logger(Colors.magenta(`started total wallets = ${wallets.length}`))
	let i = 0
	mapLimit(wallets, 1, async (n, next) => {
		try {
			//const tx = await CoNETDePINHoleskySC.changeBlackList(n, true)
			const tx = await CoNETDePINHoleskySC.changeWhiteList(n, false)
			const ts = await tx.wait()
			logger(Colors.blue(`[${++i}] => ${n} success!`))
		} catch (ex: any) {
			logger(Colors.red(`CoNETDePINHoleskySC.changeBlackList error! ${ex.message}`))
		}
	})
}
const [,,...args] = process.argv
args.forEach ((n, index ) => {
	if (/^f\=/i.test(n)) {
		const filename = n.split('=')[1]
		startFile(filename)
	} 
})
