import Express, { Router } from 'express'
import { logger } from '../util/util'
import Colors from 'colors/safe'
import {createServer} from 'node:http'
import type {Response, Request } from 'express'
import {ethers} from 'ethers'
import GuardianNodesV2ABI from './CGPNv7New.json'
import NodesInfoABI from './CONET_nodeInfo.ABI.json'
import {mapLimit} from 'async'
import {createMessage, encrypt, enums, readKey,generateKey, readPrivateKey, decryptKey} from 'openpgp'

const getIpAddressFromForwardHeader = (req: Request) => {
    const ipaddress = req.headers['X-Real-IP'.toLowerCase()]
    if (!ipaddress||typeof ipaddress !== 'string') {
        return ''
    }
    return ipaddress
}

const CONET_Guardian_PlanV7 = '0x312c96DbcCF9aa277999b3a11b7ea6956DdF5c61'.toLowerCase()
const GuardianNodesInfoV6_cancun = '0x88cBCc093344F2e1A6c2790A537574949D711E9d'
const provider = new ethers.JsonRpcProvider('https://cancun-rpc.conet.network')
let Guardian_Nodes: nodeInfo[] = []

const getAllNodes = () => new Promise(async resolve=> {

	const GuardianNodes = new ethers.Contract(CONET_Guardian_PlanV7, GuardianNodesV2ABI, provider)
	let scanNodes = 0
	try {
		const maxNodes: BigInt = await GuardianNodes.currentNodeID()
		scanNodes = parseInt(maxNodes.toString())

	} catch (ex) {
		resolve (false)
		return logger (`getAllNodes currentNodeID Error`, ex)
	}
	if (!scanNodes) {
		resolve (false)
		return logger(`getAllNodes STOP scan because scanNodes == 0`)
	}

	Guardian_Nodes = []

	for (let i = 0; i < scanNodes; i ++) {
		Guardian_Nodes.push({
			region: '',
			ip_addr: '',
			armoredPublicKey: '',
			nftNumber: 100 + i,
			domain: ''
		})
	}
		
	const GuardianNodesInfo = new ethers.Contract(GuardianNodesInfoV6_cancun, NodesInfoABI, provider)
	let i = 0
	mapLimit(Guardian_Nodes, 10, async (n: nodeInfo, next) => {
		i = n.nftNumber
		const nodeInfo = await GuardianNodesInfo.getNodeInfoById(n.nftNumber)
		n.region = nodeInfo.regionName
		n.ip_addr = nodeInfo.ipaddress
		n.armoredPublicKey = Buffer.from(nodeInfo.pgp,'base64').toString()
		const pgpKey1 = await readKey({ armoredKey: n.armoredPublicKey})
		n.domain = pgpKey1.getKeyIDs()[1].toHex().toUpperCase()
	}, err => {
		const index = Guardian_Nodes.findIndex(n => n.nftNumber === i) - 1
		Guardian_Nodes = Guardian_Nodes.slice(0, index)
		logger(Colors.red(`mapLimit catch ex! Guardian_Nodes = ${Guardian_Nodes.length} `))
		Guardian_Nodes = Guardian_Nodes.filter(n => n.armoredPublicKey)
		resolve(true)
	})
})

const getRandomNode = () => {
    if (!Guardian_Nodes.length) {
        return null
    }
    const index = Math.floor(Math.random() * Guardian_Nodes.length)
    return Guardian_Nodes[index]
}


class conet_dl_server {

	private PORT = 4000
	private initSetupData = async () => {
		this.startServer()
	}

	constructor () {
		this.initSetupData ()
	}

	private startServer = async () => {
		
		const app = Express()
		const router = Router ()
		app.disable('x-powered-by')
        app.use((err: any, req: any, res: any, next: any) => {
            if (err) {
                console.error(err)
                return res.status(400).send({ status: 400, message: err.message }); // Bad request
            }
        })
		app.use(Express.json())

		app.once ( 'error', ( err: any ) => {
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

		app.all ('*', (req: any, res: any) => {
			const url = new URL (req.url)
            const search = url.search
            const node = getRandomNode()

            if (!node) {
                return res.redirect(301, `https://silentpass.io/download/index.html`)
            }

            res.redirect(302, `https://${node.domain}.conet.network/download/index.html${search}`)
		})

        await getAllNodes()
		logger(`start master server!`)

		server.listen(this.PORT, '127.0.0.1', () => {
			return console.table([
				{ 'CoNET paymentHook': `started success ${ this.PORT }` }
			])
		})
	}

}

new conet_dl_server ()