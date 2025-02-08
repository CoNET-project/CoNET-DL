import {ethers} from 'ethers'
import { masterSetup} from './util'
import {logger} from './logger'
import GuardianMiningABI from './GuardianMining.json'
import {mapLimit} from 'async'
import Colors from 'colors/safe'
import { inspect } from 'node:util'
import CONET_Point_ABI from './cCNTP.json'
import rateABI from '../endpoint/conet-rate.json'
import CoNETDePINMiningABI from './CoNETDePINMiningABI.json'
import CoNET_CancunRefferABI from './CONETDePINReferralABI.json'
const CONET_HoleskyRPC = 'https://rpc.conet.network'
const CoNET_CancunRPC = 'https://cancun-rpc.conet.network'
const provode_Cancun = new ethers.JsonRpcProvider(CoNET_CancunRPC)
const provode_Holesky = new ethers.JsonRpcProvider(CONET_HoleskyRPC)
const rateAddr = '0x467c9F646Da6669C909C72014C20d85fc0A9636A'
const cCNTP_holeskyAddr = '0xa4b389994A591735332A67f3561D60ce96409347'
const CoNETDePINMiningContract = '0x67EFf53e453C1B6d8609114d2351fCa18BFc0a32'
const cntpHolesky = new ethers.Contract(cCNTP_holeskyAddr, CONET_Point_ABI, provode_Holesky)

import {abi as CONET_Referral_ABI} from '../util/conet-referral.json'

const RefferV4_HoleskyAddr = '0x1b104BCBa6870D518bC57B5AF97904fBD1030681'
const RefferV4_CancunAddr = '0xbd67716ab31fc9691482a839117004497761D0b9'
const referralsV3_Holesky_Contract = new ethers.Contract(RefferV4_HoleskyAddr, CONET_Referral_ABI, provode_Holesky)
const referralsV3_Cancun_Contract = new ethers.Contract(RefferV4_CancunAddr, CoNET_CancunRefferABI, provode_Cancun)
const adminList=[
	"0xB2dAD8d6d8a9755e269f4c447844327648723C94",
	"0x299DF9eF2C011aaEc3587e296A78E8e75838B2F7",
	"0x830D4476A1FdF98bd6515353073527316DC315f1"
]

const addAdmin = () => {
	const adminWallet = new ethers.Wallet(masterSetup.guardianAmin[3], provode_Cancun)
	logger(`master wallet [${adminWallet.address}]`)

	const Contract = new ethers.Contract(RefferV4_CancunAddr, CoNET_CancunRefferABI, adminWallet)
	mapLimit(adminList, 1, async (n, next) => {
		await Contract.changeAddressInAdminlist(n, true)
	}, (err: any)=> {
		if (err) {
			logger(Colors.red(`addAdmin Error! ${err.message}`))
		} else {
			logger(Colors.blue(`addAdmin success!`))
		}
		
	})
}

interface initCNTP {
	wallet: string
	value: BigInt
}

interface initReffer {
	wallet: string
	reffer: string
}

const walletPool: Map<string, boolean> = new Map()
let walletProcess: initCNTP[] = []
const RefferPool: Map<string, boolean> = new Map()
let ReffeProcess: initReffer[] = []
const adminWalletPool: ethers.Wallet[] = []

for (let i = 0; i < masterSetup.conetNodeAdmin.length; i ++) {
	const CNTP_refe_manager = new ethers.Wallet(masterSetup.conetNodeAdmin[i], provode_Cancun)
	adminWalletPool.push(CNTP_refe_manager)
}

const startProcess_Reff = async () => {
	const reff = ReffeProcess.shift()
	if (!reff) {
		return
	}
	const admin = adminWalletPool.shift()
	if (!admin) {
		ReffeProcess.unshift(reff)
		return
	}
	startProcess_Reff()
	const referralsV3_Cancun = new ethers.Contract(RefferV4_CancunAddr, CoNET_CancunRefferABI, admin)

	ReffeProcess = []
	try {
		const tx = await referralsV3_Cancun.initAddReferrer(reff.reffer, reff.wallet)
		logger(Colors.blue(`startProcess initCNTP success! ${tx.hash}`))
	} catch (ex: any) {
		logger(Colors.red(`startProcess initCNTP Error! ${ex.message}`))
	}
	startProcess_Reff()
}


const startProcess_CNTP = async () => {
	if (!walletProcess.length) {
		return
	}
	const admin = adminWalletPool.shift()
	if (!admin) {
		return
	}

	const CNTP_initContract = new ethers.Contract(CoNETDePINMiningContract, CoNETDePINMiningABI, admin)

	const wallet = walletProcess.map(n => n.wallet)
	const values = walletProcess.map(n => n.value)
	walletProcess = []
	try {
		const tx = await CNTP_initContract.initCNTP(wallet, values)
		logger(Colors.blue(`startProcess initCNTP success! ${tx.hash}`))
	} catch (ex: any) {
		logger(Colors.red(`startProcess initCNTP Error! ${ex.message}`))
	}
	adminWalletPool.push(admin)
}

export const refferInit = async (wallet: string, reffer: string) => {
	if ( wallet ===  ethers.ZeroAddress) {
		return
	}

	const exiest = RefferPool.get (wallet)
	if (exiest) {
		return 
	}
	RefferPool.set(wallet, true)

	if (!reffer) {
		reffer = await referralsV3_Holesky_Contract.getReferrer(wallet)
	}

	if (!reffer || reffer == ethers.ZeroAddress) {
		return
	}
	
	const newRef = await referralsV3_Cancun_Contract.getReferrer(wallet)
	if (newRef === ethers.ZeroAddress) {
		return
	}
	ReffeProcess.push ({wallet, reffer})
}

export const initCNTP = async (wallet: string) => {
	if (wallet === ethers.ZeroAddress ) {
		return
	}
	const _walletISInit = walletPool.get(wallet)
	if ( _walletISInit ) {
		return
	}
	
	const value = await cntpHolesky.balanceOf(wallet)
	if (value !== BigInt(0)) {
		walletPool.set(wallet, true)
	}
	walletProcess.push({
		wallet, value
	})
}


export const startProcess = async () => {
	startProcess_CNTP()
	startProcess_Reff()
}

