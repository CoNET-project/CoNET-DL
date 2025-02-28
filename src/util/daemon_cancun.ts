import {ethers} from 'ethers'
import { masterSetup} from './util'
import {logger} from './logger'
import GuardianMiningABI from './GuardianMining.json'
import {mapLimit} from 'async'
import Colors from 'colors/safe'
import { inspect } from 'node:util'

const CoNET_cancunRPC = 'https://cancun-rpc.conet.network'
const conet_Cancun = new ethers.JsonRpcProvider(CoNET_cancunRPC)
const GuardianMiningAddr = '0xa37A017FcBe39B35806804C0e7b9E90775B60D8F'
const adminList = [
	"0x379FAFb146d8BC51d035E34e9A8b37Fba2a9bf84",
	"0xeAE8F857bCcE758AfF3f9D53bAE79C353f79aAf4",
	"0x2125ee19468555fe10FcCa595824A56d2a0870E6",
	"0xCCfA8Dafd4343c7B8cb11c38F515a873c0DFcA92"
]
const adminWallet1 = new ethers.Wallet(masterSetup.guardianAmin[0], conet_Cancun)
const adminWallet2 = new ethers.Wallet(masterSetup.guardianAmin[1], conet_Cancun)
const ContractNode = new  ethers.Contract(GuardianMiningAddr, GuardianMiningABI, adminWallet1)
const ContractReffer = new  ethers.Contract(GuardianMiningAddr, GuardianMiningABI, adminWallet2)

const addAdmin = () => {
	const adminWallet = new ethers.Wallet(masterSetup.guardianAmin[3], conet_Cancun)
	logger(`master wallet [${adminWallet.address}]`)

	const Contract = new  ethers.Contract(GuardianMiningAddr, GuardianMiningABI, adminWallet)
	// mapLimit(adminList, 1, async (n, next) => {
	// 	await Contract.changeAddressInAdminlist(n, true)
	// }, (err: any)=> {
	// 	if (err) {
	// 		logger(Colors.red(`addAdmin Error! ${err.message}`))
	// 	} else {
	// 		logger(Colors.blue(`addAdmin success!`))
	// 	}
		
	// })
}

let EPOCH = 0
let rate = 1
const checkGasPrice = 15000000

const mining = async () => {
	
	const feeData = await conet_Cancun.getFeeData()
	logger(inspect(feeData, false, 3, true))

	try {
		const [a, b] = await Promise.all([
			ContractNode.startNodeMining(rate),
			ContractReffer.startGuardianReferrals(rate)
		])
		logger(`mining ${a.hash} ${b.hash}`)
	} catch (ex: any) {
		logger(`mining Error ${ex.message}`)
	}

	rate = 1
}

const startListeningCONET_Holesky_EPOCH = async () => {
	EPOCH = await conet_Cancun.getBlockNumber()
	
	logger(Colors.magenta(`startListeningCONET_Holesky_EPOCH [${EPOCH}] start! `))
	conet_Cancun.on('block', async block => {
		if (block % 2 ) {
			EPOCH = block
			

			return mining()
		}
	})
	
}

startListeningCONET_Holesky_EPOCH()
