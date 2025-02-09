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
import {abi as CONET_Referral_ABI} from '../util/conet-referral.json'
import GuardianPlan_new_ABI from './GuardianNodesV2.json'
import GuardianInitABI from './GuardianInitABI.json'

const CONET_HoleskyRPC = 'https://rpc.conet.network'
const CoNET_CancunRPC = 'http://207.90.195.48:8001'
const provode_Cancun = new ethers.JsonRpcProvider(CoNET_CancunRPC)
const provode_Holesky = new ethers.JsonRpcProvider(CONET_HoleskyRPC)
const rateAddr = '0x467c9F646Da6669C909C72014C20d85fc0A9636A'
const cCNTP_holeskyAddr = '0xa4b389994A591735332A67f3561D60ce96409347'
const CoNETDePINMiningContract = '0x3B91CF65A50FeC75b9BB69Ded04c12b524e70c29'
const cntpHolesky = new ethers.Contract(cCNTP_holeskyAddr, CONET_Point_ABI, provode_Holesky)

const GuardianInitAddr = '0xAA32dE55fcf35fa0A6F5ece21539E04f2ECee21c'


const RefferV4_HoleskyAddr = '0x1b104BCBa6870D518bC57B5AF97904fBD1030681'
const RefferV4_CancunAddr = '0xbd67716ab31fc9691482a839117004497761D0b9'
const Guardian_Holesky = '0x35c6f84C5337e110C9190A5efbaC8B850E960384'

const referralsV3_Holesky_Contract = new ethers.Contract(RefferV4_HoleskyAddr, CONET_Referral_ABI, provode_Holesky)
const referralsV3_Cancun_Contract = new ethers.Contract(RefferV4_CancunAddr, CoNET_CancunRefferABI, provode_Cancun)

const GuardianP_HoleskySC = new ethers.Contract(Guardian_Holesky, GuardianPlan_new_ABI, provode_Holesky)
const adminList=[
	"0x6add8012d4DDb7dA736Ab713FdA13ef3827a05bf",
	"0x068759bCfd929fb17258aF372c30eE6CD277B872",
	"0x25a32f1321EBABe7BBE78CbD1BeB1c4C4f4f2E2B",
	"0x779cc98eeA4aCDB3BDDb34418B79BD62261f2D33",
	"0x42a9492B15E2f725b0798CFeF15eaD2576B7d761",
	"0xeCfe79936753623080D8f3E99dbaE39FD335DBB5",
	"0xB2dAD8d6d8a9755e269f4c447844327648723C94",
	"0x299DF9eF2C011aaEc3587e296A78E8e75838B2F7",
	"0x830D4476A1FdF98bd6515353073527316DC315f1"
]
const GuardianInitWallet = new ethers.Wallet(masterSetup.guardianAmin[0], provode_Cancun)
const initGuardianSC = new ethers.Contract(GuardianInitAddr, GuardianInitABI, GuardianInitWallet)

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
	logger(Colors.blue(`startProcess startProcess_Reff POOL size = ${ReffeProcess.length}`))
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
		await tx.wait()
		logger(Colors.blue(`startProcess startProcess_Reff success! ${tx.hash} POOL size = ${ ReffeProcess.length }`))
	} catch (ex: any) {
		logger(Colors.red(`startProcess startProcess_Reff Error! ${ex.message}`))
	}

	adminWalletPool.push(admin)
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

	if (!reffer || reffer === '') {
		reffer = await referralsV3_Holesky_Contract.getReferrer(wallet)
	}

	if (!reffer || reffer == ethers.ZeroAddress) {
		logger(Colors.gray(`refferInit ${wallet} has ethers.ZeroAddress STOP! ${reffer}`))
		return
	}
	
	// const newRef = await referralsV3_Cancun_Contract.getReferrer(wallet)
	// if (newRef !== ethers.ZeroAddress) {
	// 	return
	// }
	logger(Colors.gray(`refferInit added ${wallet} Reffe ${reffer} to Process POOL! Size ${ReffeProcess.length}`))
	ReffeProcess.push ({wallet, reffer})
}

interface GroudinerNFTData {
	wallet: string
	nft1: BigInt
	nft2: BigInt
}

const initGroudinerNFTPool: GroudinerNFTData[] = []

const processInitGroudinerNFT = async () => {
	if (!initGroudinerNFTPool.length) {
		return
	}
	const _data = initGroudinerNFTPool.shift()
	if (!_data) {
		return
	}

	try {
		const tx = await initGuardianSC.initGuardian(_data.wallet, _data.nft1, _data.nft2)
		await tx.walt()
		logger(Colors.gray(`processInitGroudinerNFT ${_data.wallet} Success ! hash = ${tx.hash}`))

	} catch (ex: any) {
		logger(Colors.grey(`processInitGroudinerNFT Error, ${ex.message}`))
	}
	processInitGroudinerNFT()
}


const checkGroudinerNFT = async (wallet: string) => {

	let nft1: BigInt, nft2: BigInt
	let isInit: boolean
	[nft1, nft2, isInit] = await Promise.all ([
		GuardianP_HoleskySC.balanceOf(wallet, 1),
		GuardianP_HoleskySC.balanceOf(wallet, 2),
		initGuardianSC.isInit(wallet)
	])

	if (nft1 == BigInt(0) && nft2 == BigInt(0) && !isInit) {
		return
	}

	initGroudinerNFTPool.push({
		wallet, nft1, nft2
	})

	processInitGroudinerNFT()
	
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

	checkGroudinerNFT(wallet)
}


export const startProcess = async () => {
	startProcess_CNTP()
	startProcess_Reff()
}


checkGroudinerNFT('0x69237C9B639577d5F8A2A8970B76A92fCbeE3C34')