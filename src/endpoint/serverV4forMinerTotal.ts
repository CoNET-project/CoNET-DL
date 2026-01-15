/**
 * 			
 * */
import Express, { Router } from 'express'
import type {Response, Request } from 'express'
import { join } from 'node:path'
import { inspect } from 'node:util'
import Colors from 'colors/safe'
import Cluster from 'node:cluster'
import { masterSetup, getServerIPV4Address, conet_cancun_rpc} from '../util/util'
import {logger} from '../util/logger'
import devplopABI from './develop.ABI.json'
import {ethers} from 'ethers'
import { writeFile} from 'node:fs/promises'
import {cntpAdminWallet, startEposhTransfer} from './utilNew'
import faucet_v3_ABI from './faucet_v3.abi.json'
import Ticket_ABI from './ticket.abi.json'
import CNTP_TicketManager_class  from '../util/CNTP_Transfer_pool'
import {abi as CONET_Referral_ABI} from '../util/conet-referral.json'
import rateABI from './conet-rate.json'
import { refferInit, initCNTP, startProcess} from '../util/initCancunCNTP'
import GuardianNodesV2ABI from '../util/GuardianNodesV2.json'
import NodesInfoABI from './CONET_nodeInfo.ABI.json'
import {readKey} from 'openpgp'
import {mapLimit, retry, until} from 'async'
import epoch_info_ABI from './epoch_info_managerABI.json'
import GB_airdropABI from './ABI/CONET _sGB.ABI.json'
import newNodeInfoABI from './newNodeInfoABI.json'
	import {createServer} from 'node:http'
import { log } from 'node:console'
import duplicateFactory_ABI from './duplicateFactory.ABI.json'
import CONET_PGPABI from './ABI/CoNETPGP.json'

const CONET_MAINNET = new ethers.JsonRpcProvider('https://mainnet-rpc.conet.network') 
const GuardianNodeInfo_mainnet = '0x2DF3302d0c9aC19BE01Ee08ce3DDA841BdcF6F03'
const GuardianNodesMainnet = new ethers.Contract(GuardianNodeInfo_mainnet, newNodeInfoABI, CONET_MAINNET)


let Guardian_Nodes: Map<string, nodeInfo> = new Map()

const getAllNodes = () => new Promise(async resolve=> {

    const _nodes1 = await GuardianNodesMainnet.getAllNodes(0, 400)
    const _nodes2 = await GuardianNodesMainnet.getAllNodes(400, 800)
    const _nodes = [..._nodes1, ..._nodes2]

    for (let i = 0; i < _nodes.length; i ++) {
        const node = _nodes[i]
        const id = parseInt(node[0].toString())
        const pgpString: string = Buffer.from( node[1], 'base64').toString()
        const domain: string = node[2]
        const ipAddr: string = node[3]
        const region: string = node[4]
        
        logger(i)

            const itemNode: nodeInfo = {
            ip_addr: ipAddr,
            armoredPublicKey: pgpString,
            domain: domain,
            nftNumber: id,
            region: region
        }
    
        Guardian_Nodes.set(ipAddr, itemNode)
        
       
    }
    logger(Colors.red(`mapLimit catch ex! Guardian_Nodes = ${Guardian_Nodes.size} `))
    resolve(true)
})



const workerNumber = Cluster?.worker?.id ? `worker : ${Cluster.worker.id} ` : `${ Cluster?.isPrimary ? 'Cluster Master': 'Cluster unknow'}`

//	for production



//	for debug
	// import {createServer as createServerForDebug} from 'node:http'

const packageFile = join (__dirname, '..', '..','package.json')
const packageJson = require ( packageFile )
const version = packageJson.version

const provide_cancun = new ethers.JsonRpcProvider(conet_cancun_rpc)
const provide_mainnet = new ethers.JsonRpcProvider('https://mainnet-rpc.conet.network')

export const checkGasPrice = 1550000
const GB_airdropWallet = new ethers.Wallet(masterSetup.GB_airdrop, provide_mainnet)                 //          0x42aD56d9CE0f2c38c3Ba83b8DB51b7E58A656F07
const eGB_addr = '0x84aAD9aD5BbdDfC0cCcb6A599DFadaEFaF6B497E'
const GB_airdropSCPool = [new ethers.Contract(eGB_addr, GB_airdropABI, GB_airdropWallet)]


//			getIpAddressFromForwardHeader(req.header(''))
const getIpAddressFromForwardHeader = (req: Request) => {
	const ipaddress = req.headers['X-Real-IP'.toLowerCase()]
	if (!ipaddress||typeof ipaddress !== 'string') {
		return ''
	}
	return ipaddress
}


process.on('unhandledRejection', (reason) => { throw reason; })

const MAX_TX_Waiting = 1000 * 60 * 3

const startFaucetProcess = () => new Promise(async resolve => {
	if (!faucetWaitingPool.length) {
		return resolve (false)
	}
	const sc = faucet_v3_Contract_Pool.shift()
	if (!sc) {
		return
	}

	logger(`faucetWaitingPool Start Faucet Process Wainging List length = ${faucetWaitingPool.length}`)

	logger(`faucetWaitingPool length = ${faucetWaitingPool.length}`)

	const splited = faucetWaitingPool.slice(0, 150)
	faucetWaitingPool = faucetWaitingPool.slice(150)

	const ipAddress = splited.map(n => n.ipAddress)
	const wallet = splited.map(n => n.wallet)

	try {
		
		const tx = await sc.getFaucet(wallet, ipAddress)
		await tx.wait()

		logger(`startFaucetProcess Success ${tx.hash}`)

	} catch (ex: any) {
		logger(`startFaucetProcess Error!`, ex.message)
	}
	faucet_v3_Contract_Pool.unshift(sc)
	return resolve(true)
})

const scAddr = '0x7859028f76f83B2d4d3af739367b5d5EEe4C7e33'.toLowerCase()

const sc = new ethers.Contract(scAddr, devplopABI, provide_cancun)

const developWalletPool: Map<string, boolean> = new Map()

const epoch_mining_info_cancun_addr = '0x31680dc539cb1835d7C1270527bD5D209DfBC547'
const epoch_mining_info_mainnet_addr = '0xbC713Fef0c7Bb178151cE45eFF1FD17d020a9ecD'

const epoch_mining_manager = new ethers.Wallet(masterSetup.epochManagre, provide_mainnet)

logger(`masterSetup.epochManagre = ${epoch_mining_manager.address}`)
const epoch_mining_sc = new ethers.Contract(epoch_mining_info_mainnet_addr, epoch_info_ABI, epoch_mining_manager)

const CONET_Guardian_cancun_addr = '0x312c96DbcCF9aa277999b3a11b7ea6956DdF5c61'
const GuardianNodesInfoV6_cancun_addr = '0x88cBCc093344F2e1A6c2790A537574949D711E9d'


const getAllDevelopAddress = async () => {
	let ret: any []
	try {
		ret = await sc.getAllDevelopWallets()
		
	} catch (ex: any) {
		return logger(Colors.red(`getAllDevelopAddress call error!`), ex.message)
	}

	for (let i = 0; i < ret.length; i ++){
		logger(Colors.blue(`getAllDevelopAddress added ${(ret[i][0])} to developWalletPool`))
		developWalletPool.set (ret[i][0].toLowerCase(), ret[i][1])
	}
}

const developWalletListening = async (block: number) => {
	
	const blockTs = await provide_cancun.getBlock(block)

	if (!blockTs?.transactions) {
        return 
    }

	for (let tx of blockTs.transactions) {

		const event = await provide_cancun.getTransaction(tx)
		
		if ( event?.to?.toLowerCase() === scAddr) {
			await getAllDevelopAddress()
		}
		
	}
}


const workingNodeIpAddress: Map<string, string> = new Map()

const stratlivenessV2 = async (eposh: number) => {
    logger(`stratlivenessV2 ${eposh}!`)
	await Promise.all([
		startProcess(),
		startFaucetProcess(),
		developWalletListening(eposh),
		moveData(eposh)
	])
}

const faucetV3_cancun_Addr = `0x8433Fcab26d4840777c9e23dC13aCC0652eE9F90`
const ticketAddr = '0x92a033A02fA92169046B91232195D0E82b8017AB'
const conet_Referral_cancun = '0xbd67716ab31fc9691482a839117004497761D0b9'

const faucetWallet = new ethers.Wallet(masterSetup.newFaucetAdmin[5], provide_cancun)
logger(Colors.magenta(`faucetWallet = ${faucetWallet.address}`))
const faucetContract = new ethers.Contract(faucetV3_cancun_Addr, faucet_v3_ABI, faucetWallet)
const faucet_v3_Contract_Pool = [faucetContract]

const ticketWallet = new ethers.Wallet(masterSetup.newFaucetAdmin[2], provide_cancun)
const profileWallet = new ethers.Wallet(masterSetup.newFaucetAdmin[3], provide_cancun)
export const ticket_contract = new ethers.Contract(ticketAddr, Ticket_ABI, ticketWallet)
const contract_Referral = new ethers.Contract(conet_Referral_cancun, CONET_Referral_ABI, provide_cancun)

interface faucetRequest {
	wallet: string
	ipAddress: string
}

export const checkGasPriceFordailyTaskPool = 25000000
const eGB_Pool: Map<string, number> = new Map()
export const GB_airdropPool: Map<string, number> = new Map()

let faucetWaitingPool: faucetRequest[] = []

let currentEpoch = 0

const managerSC_Pool: ethers.Contract[]= []

const ConetPGP = '0x902A0592C8cB96c49f6818051aAf96C89F4318B3'

masterSetup.initManager.forEach(n => {
    const adminWallet = new ethers.Wallet(n, provide_mainnet)
    const SC = new ethers.Contract(ConetPGP, CONET_PGPABI, adminWallet)
    managerSC_Pool.push(SC)
    console.log (`=====================>`,adminWallet.address)
})
    







const addTofaucetPool = async (wallet: string, ipAddress: string) => {
	const index = faucetWaitingPool.findIndex(n => n.wallet === wallet)
	if (index > -1) {
		return
	}

	try {
		const balance: BigInt = await provide_cancun.getBalance(wallet)
		if (!balance) {
			faucetWaitingPool.push({wallet, ipAddress})
			startFaucetProcess()
		}
	} catch (ex:any) {
		logger(Colors.red(`addTofaucetPool catch error, ${ex.message}`))
	}
}

const epochNodeData: Map<number, Map<string,InodeEpochData >> = new Map()
const epochTotalData:  Map<number, IGossipStatus > = new Map()

const miningData = (body: any, res: Response) => {
	
	const ephchKey = parseInt(body.epoch)

	let eposh = epochNodeData.get(ephchKey)
	if (!eposh) {
		eposh = new Map()
		epochNodeData.set(ephchKey, eposh)
	}

	eposh.set (body.ipaddress, {wallets: [...body.wallets, body.nodeWallet], users: body.users, nodeWallet: body.nodeWallet})

	let epochTotal = epochTotalData.get (ephchKey)
	if (!epochTotal) {
		epochTotal = {
			totalConnectNode: 0,
			epoch: ephchKey,
			totalMiners: 0,
			totalUsers: 0
		}

		epochTotalData.set(ephchKey, epochTotal)
	}
    
	epochTotal.totalMiners += body.wallets.length + 1
	epochTotal.totalUsers += body.users.length
	epochTotal.totalConnectNode += 1

    const node = Guardian_Nodes.get(body.ipaddress)
    if (node) {
        const domain = node.domain
        workingNodeIpAddress.set(body.ipaddress, domain)
    } else {
        logger(`body.ipaddress ${body.ipaddress} has none of Guardian_Nodes Error! -------------------------------------------------`)
    }
    

	logger(Colors.grey(`/miningData eposh ${body.epoch} nodes ${body.ipaddress} nodewallet ${body.nodeWallet} = ${eposh.size} [${body.wallets.length}:${ body.users.length}]`))
    
    const transfer: transferGB[] = body?.transfer
    
    if (!transfer) {
        logger(`${body.ipaddress}. ***** transfer undefine!!!`)
    } else {
        const nodeWallet = body.nodeWallet.toLowerCase()
        let nodeTotal = eGB_Pool.get(nodeWallet)||0
        transfer.forEach(n => {
            const wallet = n.wallet.toLowerCase()
            const transferData = eGB_Pool.get(wallet)||0
            const total = transferData + n.bytes
            nodeTotal += total
            eGB_Pool.set(wallet, total)
        })

        if (nodeTotal>0) {
            eGB_Pool.set(nodeWallet, nodeTotal)
        }
        
        
    }


	addTofaucetPool(body.nodeWallet, body.ipaddress)
	return res.status(200).end()
}

const updateEpochToSC = async (epoch: iEPOCH_DATA) => {
	//	uint256 totalMiners, uint256 minerRate, uint256 totalUsrs, uint256 epoch
	try {

		const tx = await epoch_mining_sc.updateInfo(epoch.totalMiners, ethers.parseEther(epoch.minerRate.toFixed(10)), epoch.totalUsrs)
		await tx.wait()
		logger(Colors.blue(`updateEpochToSC current data to epoch info success! ${tx.hash}`))
	} catch (ex: any) {
		logger(Colors.red(`updateEpochToSC store Cancun Error! ${ex.message}`))
	}
	
}

const rateAddr = '0xE95b13888042fBeA32BDce7Ae2F402dFce11C1ba'.toLowerCase()
const filePath = '/home/peter/.data/v2/'

const ReferralsMap: Map<string, string> = new Map()
const initV3Map: Map<string, boolean> = new Map()


let EPOCH_DATA: iEPOCH_DATA


const duplicateFactoryAddr = '0x87A70eD480a2b904c607Ee68e6C3f8c54D58FB08'
const SPDuplicateFactoryContract = new ethers.Contract(duplicateFactoryAddr, duplicateFactory_ABI, provide_mainnet)

const duplicateList: Map<string, string> = new Map()

const getDuplicateAccount = async (walletAddress: string) => {
    walletAddress = walletAddress.toLowerCase()
    let duplicate = duplicateList.get(walletAddress) || await SPDuplicateFactoryContract.duplicateList(walletAddress)
    if (duplicate === ethers.ZeroAddress) {
        duplicate = walletAddress
    }
    duplicateList.set(walletAddress, duplicate)
    return duplicate
}


const getData = async () => {
    const wallets: string[] = []
    const airdropGBs: number[] = []
    let total = 0

    const tasks = Array.from(GB_airdropPool.entries()).map(async ([key, val]) => {
        if (val > 0) {
            const duplicate = await getDuplicateAccount(key)
            logger(`GB_airdrop airdrop to ${key} duplicate = ${duplicate} GB = ${val}`)
            wallets.push(duplicate)
            airdropGBs.push(val)
            total += val
        }
        GB_airdropPool.delete(key)
    })

    await Promise.all(tasks)

    return { wallets, airdropGBs, total }
}

const GB_airdrop = async () => {
    const SC = GB_airdropSCPool.shift()
    if (!SC) {
        return
    }

    const {wallets, airdropGBs, total} = await getData()

    if (wallets.length > 0) {
        try {
            const ts = await SC.issueGBBatch(wallets, airdropGBs)
            await ts.wait()
            logger(`GB_airdrop *********** wallets length = ${wallets.length} TOTAL GB = ${total} ${ts.hash} ***************************`)
        } catch (ex: any) {
            logger(`GB_airdrop ERROR: ${ex.message}`)
        }
    } else {
        logger(`GB_airdrop no wallets to airdrop! total = ${total}`)
    }

    GB_airdropSCPool.unshift(SC)

}

const getRandomNode = async () => {
    let node

    const keys = Array.from(workingNodeIpAddress.keys())
    if (keys.length) {
        const index = Math.floor(Math.random()* keys.length)
        
        node = workingNodeIpAddress.get(keys[index])

    } else {
        logger(`############################### workingNodeIpAddress = ${workingNodeIpAddress.size}`)
    }
    
    return node
}

type pgpData = {
    pgpKeyID: string
    pgpPublicKeyArmored: string
    nodeWallet: string
}


const datas: {pgpData: pgpDataToSC}[] = []


const writeNodeInfoPGPProcess = async () => {
    const obj = datas.shift()
    if (!obj) return 

    const SC =  managerSC_Pool.shift ()
    if (!SC) {
        datas.unshift(obj)
        return setTimeout(() => writeNodeInfoPGPProcess(), 4000)
    }

    try {
        const tx = await SC.addRoutes(obj.pgpData.pgpKeyID, obj.pgpData.pgpPublicKeyArmored, obj.pgpData.nodeWallet )
        await tx.wait()
        logger(`writeNodeInfoPGP success ${tx.hash}`)

    } catch (ex: any) {
        logger(`writeNodeInfoPGP process error! ${ex.message}`)
        datas.unshift(obj)

    }
    managerSC_Pool.push(SC)
    setTimeout(() => writeNodeInfoPGPProcess(), 6000)

}

type pgpDataToSC = {
    pgpKeyID: string[]
    pgpPublicKeyArmored: string[]
    nodeWallet: string[]
}

const writeNodeInfoPGP = (nodeWallets: {ipAddr:string, wallet: string}[]) => {
    logger(`writeNodeInfoPGP nodeWallets = ${nodeWallets.length}`)

    const data: pgpData[] = []

    nodeWallets.forEach(n => {
        const ipaddress = n.ipAddr
        const nodeWallet = n.wallet

        const nodeInfo = Guardian_Nodes.get(ipaddress)
        if (!nodeInfo) {
            return logger(`writeNodeInfoPGP Error node ${ipaddress} haven't INFO!!!!!!!!!!!!!!!!!!`)
        }
        const pgpPublicKeyArmored = nodeInfo.armoredPublicKey
        const pgpKeyID = nodeInfo.domain
        data.push({
            pgpPublicKeyArmored,
            pgpKeyID,
            nodeWallet
        })

    })

    let pgpKeyID: string[] = []
    let pgpPublicKeyArmored: string[] = []
    let nodeWallet: string[] = []

    for (const k of data) {
        pgpKeyID.push(k.pgpKeyID)
        pgpPublicKeyArmored.push(k.pgpPublicKeyArmored)
        nodeWallet.push(k.nodeWallet)

        if (pgpKeyID.length >=10) {
            datas.push({
                pgpData: {
                    pgpKeyID: [...pgpKeyID],
                    pgpPublicKeyArmored: [...pgpPublicKeyArmored],
                    nodeWallet: [...nodeWallet]
                }
            })



            // ✅ 只有凑满 10 条后才清空，开始下一组
            pgpKeyID = []
            pgpPublicKeyArmored = []
            nodeWallet = []
            writeNodeInfoPGPProcess()
        }
    }

    // ✅ 把最后不足 50 条的尾巴也塞进去（否则会丢数据）
    if (pgpKeyID.length > 0) {
        datas.push({
            pgpData: {
            pgpKeyID: [...pgpKeyID],
            pgpPublicKeyArmored: [...pgpPublicKeyArmored],
            nodeWallet: [...nodeWallet]
            }
        })
    }

    logger(`writeNodeInfoPGP make datas ${datas.length}`)

}


let skipEppoch = 0
let writewriteNodeInfoPGP = false


const moveData = async (epoch: number) => {
	const rateSC = new ethers.Contract(rateAddr, rateABI, provide_cancun)
	const rate = parseFloat(ethers.formatEther(await rateSC.miningRate()))

	const block = currentEpoch = epoch-2
	
	let _wallets_: Map<string, true> = new Map()
	let _users_: Map<string, true> = new Map()

	const epochTotal = epochTotalData.get (block)
	const epochAll =  epochNodeData.get (block)

	if (!epochTotal) {
		return logger (Colors.red(`moveData can't get epochTotal ${block}`))
	}

	if (!epochAll) {
		return logger (Colors.red(`moveData can't get epochAll ${block}`))
	}

    const nodeWallets: {ipAddr:string, wallet: string}[] = []
	epochAll.forEach((v, keys) => {
        
		v.wallets.forEach(n => _wallets_.set(n.toLowerCase(), true))

        
        nodeWallets.push({ipAddr: keys, wallet: v.nodeWallet})
        v.users.forEach(n => {
			const k = n.toLowerCase()
			_users_.set(k, true)
			_wallets_.delete(k)
		})
	})

	

	
	const totalUsrs = _users_.size
	const totalMiners = _wallets_.size
	const minerRate = (rate/totalMiners)/12
	for (let w in [..._wallets_.keys()]) {
		// refferInit(w, '')
		// initCNTP(w)
	}
	for (let w in [..._users_.keys()]) {
		// refferInit(w, '')
		// initCNTP(w)
	}

	logger(Colors.magenta(`move data connecting [${block}]= ${epochAll.size} total [${totalMiners}] miners [${_wallets_.size}] users [${_users_.size}] rate ${minerRate}`))
	const filename = `${filePath}${block}.wallet`
	const filename1 = `${filePath}${block}.total`
	const filename2 = `${filePath}${block}.users`
	const filename3 = `${filePath}current.wallet`
	const filename4 = `${filePath}current.total`
	const filename5 = `${filePath}current.users`
    const filename6 = `${filePath}current.GB`

	EPOCH_DATA = {totalMiners, minerRate, totalUsrs, epoch: block, nodeWallets}
	


        eGB_Pool.forEach((val, key) => {
            
            const GB = Math.floor(val)
            
            eGB_Pool.delete(key)
            const GB_airdrop = GB_airdropPool.get(key)||0
            GB_airdropPool.set(key, GB_airdrop + GB)
        })

	await Promise.all ([
		updateEpochToSC(EPOCH_DATA),
		writeFile(filename, JSON.stringify([..._wallets_.keys()]), 'utf8'),
		writeFile(filename1, JSON.stringify(EPOCH_DATA), 'utf8'),
		writeFile(filename2, JSON.stringify([..._users_.keys()]), 'utf8'),
		writeFile(filename3, JSON.stringify([..._wallets_.keys()]), 'utf8'),
		writeFile(filename4, JSON.stringify(EPOCH_DATA), 'utf8'),
		writeFile(filename5, JSON.stringify([..._users_.keys()]), 'utf8'),
        writeFile(filename6, JSON.stringify([..._users_.keys()]), 'utf8')
	])





	logger(Colors.blue(`moveData save files ${filename}, ${filename1}, ${filename2} success!`))
    GB_airdrop()
    if (skipEppoch ++ > 4 && !writewriteNodeInfoPGP) {
        writewriteNodeInfoPGP = true
        writeNodeInfoPGP (nodeWallets)
    } else {
        logger(`writeNodeInfoPGP skip at ${skipEppoch}`)
    }
    


	
}


class conet_dl_server {

	private PORT = 8004
	private serverID = ''

	public CNTP_manager = new CNTP_TicketManager_class ([masterSetup.gameCNTPAdmin[0]], 1000)

	private initSetupData = async () => {
        await getAllNodes()
		this.serverID = getServerIPV4Address(false)[0]
		currentEpoch = await provide_mainnet.getBlockNumber()
		await getAllDevelopAddress()
		this.startServer()

		provide_mainnet.on ('block', async _block => {

			if (_block % 2) {
				return
			}

			currentEpoch = _block
			return stratlivenessV2(_block)
			
		})
		
	}

	constructor () {
		this.initSetupData ()
    }

	private startServer = async () => {
		
		const app = Express()
		const router = Router ()
		app.disable('x-powered-by')
		const Cors = require('cors')
		app.use(Cors ())
		app.use(Express.json())

		app.use('/api', router )

		app.once('error', ( err: any ) => {
			/**
			 * https://stackoverflow.com/questions/60372618/nodejs-listen-eacces-permission-denied-0-0-0-080
			 * > sudo apt-get install libcap2-bin 
			 * > sudo setcap cap_net_bind_service=+ep `readlink -f \`which node\``
			 * 
			 */
            logger (err)
            logger (Colors.red(`Local server on ERROR`))
        })

		const server = createServer(app)

        app.get('/',async (req: any, res: any) => {
            const nodeDomain = await getRandomNode()
            if (!nodeDomain) {
                logger(`app.get('/' _node === null!`)
                return res.redirect(301, `https://silentpass.io/download/index.html`)
            }

            const url = new URL(req.url, `https://${req.headers.host}`)
            const search = url.search
            
            

            logger(`app.get('/' _node = ${nodeDomain} search=${search} ${inspect(app, false, 3, true)}`)

            res.redirect(302, `https://${nodeDomain}.conet.network/download/index.html${search}`)
        })

		this.router (router)

		app.all ('*', (req: any, res: any) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.red(`Cluster Master get unknow router from ${ipaddress} => ${ req.method } [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(404).end ()
			return res.socket?.end().destroy()
		})



		logger(`start master server!`)

		server.listen(this.PORT, '127.0.0.1', () => {
			startEposhTransfer()
			return console.table([
                { 'CoNET DL': `version ${version} startup success ${ this.PORT } Work [${workerNumber}] server key [${cntpAdminWallet.address}]` }
            ])
		})
		
	}

	private router ( router: Router ) {

		router.post ('/epoch',(req: any, res: any) => {
			res.status(200).json(EPOCH_DATA).end()
		})

        router.post ('/allNodesWallets',(req: any, res: any) => {
			res.status(200).json(EPOCH_DATA).end()
		})


		router.post ('/miningData', (req: any, res: any) => {
			miningData(req.body, res)
		})

		router.all ('*', (req: any, res: any) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.grey(`Router /api get unknow router [${ ipaddress }] => ${ req.method } [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(404).end()
			return res.socket?.end().destroy()
		})
	}
}

export default conet_dl_server

new conet_dl_server()
