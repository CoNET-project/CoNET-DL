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
import CONETianPlanABI from '../endpoint/CONETianPlan.ABI.json'
import CONETian_cancun_ABI from './CONETian_cancun_ABI.json'
import CoNETDePIN_mainnet_airdropABI from './CoNETDePIN_Mainnet_airdrop.json'

const CONET_HoleskyRPC = 'https://rpc.conet.network'
const CoNET_CancunRPC = 'https://cancun-rpc.conet.network'
const CoNET_Mainnet_oldRPC = 'https://mainnet-rpc.conet.network'
const CoNET_Mainnet_RPC = 'http://38.102.126.30:8000'
const provode_Cancun = new ethers.JsonRpcProvider(CoNET_CancunRPC)
const provode_Holesky = new ethers.JsonRpcProvider(CONET_HoleskyRPC)
const rateAddr = '0x467c9F646Da6669C909C72014C20d85fc0A9636A'
const cCNTP_holeskyAddr = '0xa4b389994A591735332A67f3561D60ce96409347'
const CoNETDePINMiningContract = '0x3B91CF65A50FeC75b9BB69Ded04c12b524e70c29'
const cntpHolesky = new ethers.Contract(cCNTP_holeskyAddr, CONET_Point_ABI, provode_Holesky)

const RefferV4_HoleskyAddr = '0x1b104BCBa6870D518bC57B5AF97904fBD1030681'
const RefferV4_CancunAddr = '0xbd67716ab31fc9691482a839117004497761D0b9'
const Guardian_Holesky = '0x35c6f84C5337e110C9190A5efbaC8B850E960384'
const Guardian_cancun = '0x312c96DbcCF9aa277999b3a11b7ea6956DdF5c61'

const CONETian_holesky_addr = '0x4F1F5c25429Ea458C9e4363F05110f668f20D58B'
const CONETian_cancun_addr = '0x6a179f7eAc9D48dd9c835Db20ba9a11bb2EB7711'

const referralsV3_Holesky_Contract = new ethers.Contract(RefferV4_HoleskyAddr, CONET_Referral_ABI, provode_Holesky)
const referralsV3_Cancun_Contract = new ethers.Contract(RefferV4_CancunAddr, CoNET_CancunRefferABI, provode_Cancun)

const GuardianP_HoleskySC = new ethers.Contract(Guardian_Holesky, GuardianPlan_new_ABI, provode_Holesky)
const CONETian_holesky_SC = new ethers.Contract(CONETian_holesky_addr, CONETianPlanABI, provode_Holesky)
const CONETian_cancun_initWallet = new ethers.Wallet(masterSetup.cancun_CONETian_Init, provode_Cancun)
const CONETian_cancun_SC = new ethers.Contract(CONETian_cancun_addr, CONETian_cancun_ABI, CONETian_cancun_initWallet)

const mainnet_old = new ethers.JsonRpcProvider(CoNET_Mainnet_oldRPC)
const mainnet = new ethers.JsonRpcProvider(CoNET_Mainnet_RPC)
const conetDePIN_mainnet_old_addr = '0x1b104BCBa6870D518bC57B5AF97904fBD1030681'
const conetDePIN_mainnet_airdrop_addr = '0xf093e5534dBd1E1fB52E29E5432C503876E658C2'

const CoNETDePIN_mainnet_old = new ethers.Contract(conetDePIN_mainnet_old_addr, CONET_Point_ABI, mainnet_old)
const CoNETDePIN_Airdrop_SC = new ethers.Contract(conetDePIN_mainnet_airdrop_addr, CONET_Point_ABI, mainnet_old)

const checkMainnetCoNETDePIN = async (wallet: string) => {
	try {
		const ba = await CoNETDePIN_mainnet_old.balanceOf(wallet)
		return ba
	} catch (ex: any) {
		logger(`checkMainnetCoNETDePIN Error! ${ex.message}`)
	}
	return BigInt(0)
}

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
const GuardianInitWallet = new ethers.Wallet(masterSetup.cancun_Guardiner_init, provode_Cancun)
const GuardianP_cancunSC = new ethers.Contract(Guardian_cancun, GuardianPlan_new_ABI, GuardianInitWallet)

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

const initCONETianNFTPool: ConetinerNFTData[] = []

const checkCONETian = async (wallet: string) => {
	let CONETian: BigInt, CONETianeferrer: BigInt
	let eferrer: string
	try {
		Promise.all([
			CONETian = await CONETian_holesky_SC.balanceOf (wallet, 0),
			CONETianeferrer = await CONETian_holesky_SC.balanceOf (wallet, 10)
		])
		
	} catch (ex: any) {
		return logger(`checkCONETian got Error! ${ex.message}`)
	}

	if (parseInt(CONETian.toString()) > 0) {
		initCONETianNFTPool.push({
			wallet, CONETian, CONETianeferrer
		})
	}
	processCONETian()
}

const processCONETian = async () => {
	if (!initCONETianNFTPool.length) {
		return
	}
	const _data = initCONETianNFTPool.shift()
	if (!_data) {
		return
	}
	
	try {
		const tx = await CONETian_cancun_SC.initMint(_data.wallet, _data.CONETian, _data.CONETianeferrer)
		tx.wait()
		logger(`processCONETian success! [${tx.hash}]`)
	} catch (ex: any) {
		logger(`processCONETian error ${ex.message}`)
	}

}


const walletPool: Map<string, boolean> = new Map()
let walletProcess: initCNTP[] = []
const RefferPool: Map<string, boolean> = new Map()
let ReffeProcess: initReffer[] = []
const adminWalletPool: ethers.Wallet[] = []
const CoNETDePIN_managerSc_Pool: ethers.Contract[] = []

for (let i = 0; i < masterSetup.conetNodeAdmin.length; i ++) {
	const CNTP_refe_manager = new ethers.Wallet(masterSetup.conetNodeAdmin[i], provode_Cancun)
	adminWalletPool.push(CNTP_refe_manager)
	const CoNETDePIN_manager = new ethers.Wallet(masterSetup.conetNodeAdmin[i], mainnet)
	const  CoNETDePIN_Manager = new ethers.Contract(conetDePIN_mainnet_airdrop_addr, CoNETDePIN_mainnet_airdropABI, CoNETDePIN_manager)
	CoNETDePIN_managerSc_Pool.push(CoNETDePIN_Manager)
	logger(`added wallet ${CoNETDePIN_manager.address}`)

}

const startProcess_Reff = async () => {
	//logger(Colors.blue(`startProcess startProcess_Reff POOL size = ${ReffeProcess.length}`))
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
		//logger(Colors.blue(`startProcess startProcess_Reff success! ${tx.hash} POOL size = ${ ReffeProcess.length }`))
	} catch (ex: any) {
		//logger(Colors.red(`startProcess startProcess_Reff Error! ${ex.message}`))
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
		//logger(Colors.gray(`refferInit ${wallet} has ethers.ZeroAddress STOP! ${reffer}`))
		return
	}
	
	// const newRef = await referralsV3_Cancun_Contract.getReferrer(wallet)
	// if (newRef !== ethers.ZeroAddress) {
	// 	return
	// }
	//logger(Colors.gray(`refferInit added ${wallet} Reffe ${reffer} to Process POOL! Size ${ReffeProcess.length}`))
	ReffeProcess.push ({wallet, reffer})
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
		let tx
		if (_data.nftNumber === 1) {
			tx = await GuardianP_cancunSC.mintBUYER_NFT(_data.wallet, _data.nft)
		} else {
			tx = await GuardianP_cancunSC.mintREFERRER_NFT(_data.wallet, _data.nft)
		}
		
		await tx.wait()
		logger(Colors.gray(`processInitGroudinerNFT ${_data.wallet} Success ! hash = ${tx.hash}`))

	} catch (ex: any) {
		logger(Colors.grey(`processInitGroudinerNFT Error, ${ex.message}`))
	}
	processInitGroudinerNFT()
}


const checkGroudinerNFT = async (wallet: string) => {

	let nft1: BigInt, nft2: BigInt
	let BUYER_Status: [boolean]
	let REFERRER_Status: [boolean]
	try {
		[nft1, nft2, BUYER_Status, REFERRER_Status] = await Promise.all ([
			GuardianP_HoleskySC.balanceOf(wallet, 1),
			GuardianP_HoleskySC.balanceOf(wallet, 2),
			GuardianP_cancunSC.getBUYER_Status(wallet),
			GuardianP_cancunSC.geREFERRER_Status(wallet)
	
		])
	} catch (ex: any ) {
		return logger(`checkGroudinerNFT Error ${ex.message}`)
	}
	
	//logger(`BUYER_Status = ${BUYER_Status}, REFERRER_Status = ${REFERRER_Status} , nft1 = ${nft1} nft2 = ${nft2}`)
	
	if (parseInt(nft1.toString()) > 0 && !BUYER_Status[0]) {
		initGroudinerNFTPool.push({
			wallet, nftNumber: 1, nft: nft1
		})
	}

	if (parseInt(nft2.toString()) > 0 && !REFERRER_Status[0]) {
		initGroudinerNFTPool.push({
			wallet, nftNumber: 2, nft: nft2
		})
	}
	

	processInitGroudinerNFT()
	
}

const initCoNETDePIN_address: Map<string, boolean> = new Map()
const initCoNETDePIN_Pool: initCNTP[] = []

const processCoNETDePIN = async () => {
	const processData = initCoNETDePIN_Pool.shift()
	if (!processData) {
		return
	}
	const SC = CoNETDePIN_managerSc_Pool.shift()
	if (!SC) {
		initCoNETDePIN_Pool.unshift(processData)
		return
	}
	try {
		const tx = await SC.airdrop(processData.wallet, processData.value)
		tx.wait()
		logger(`processCoNETDePIN success! [${processData.wallet}] => [${ethers.formatEther(processData.value)}]`)

	} catch (ex: any) {
		logger(`processCoNETDePIN SC.airdrop Error! [${ex.message}]`)
	}
	CoNETDePIN_managerSc_Pool.push(SC)
	processCoNETDePIN()
}

const initCoNETDePIN = async (wallet: string) => {

	const address = initCoNETDePIN_address.get(wallet)
	if (address) {
		return
	}

	const value = await checkMainnetCoNETDePIN (wallet)
	initCoNETDePIN_address.set(wallet, true)

	if (value > BigInt(0)) {
		initCoNETDePIN_Pool.push({
			wallet, value
		})
		processCoNETDePIN()
	}
}

export const initCNTP = async (wallet: string) => {

	checkGroudinerNFT(wallet)
	checkCONETian(wallet)
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


initCoNETDePIN('0x89F5435256804EB2Cbcf366b6dB322677eF54d46')