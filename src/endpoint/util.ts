import {ethers} from 'ethers'
import { join } from 'node:path'
import { homedir, platform } from 'node:os'
import cCNTPAbi from '../util/cCNTP.json'
import { logger } from '../util/util'

import Colors from 'colors/safe'
const setup = join( homedir(),'.master.json' )

const CONET_Holesky_RPC = new ethers.JsonRpcProvider('https://rpc.conet.network')

const masterSetup: ICoNET_DL_masterSetup = require ( setup )

const Claimable_CONET_Point_addr = '0x530cf1B598D716eC79aa916DD2F05ae8A0cE8ee2'
const cntpV1_new_chain = '0x530cf1B598D716eC79aa916DD2F05ae8A0cE8ee2'.toLowerCase()
export const cntpAdminWallet = new ethers.Wallet(masterSetup.conetFaucetAdmin)
const sendCNTP_v2_New_ChainContract = new ethers.Contract(cntpV1_new_chain, cCNTPAbi, CONET_Holesky_RPC)

logger(Colors.blue(`Node Key = ${cntpAdminWallet.address}`))
const getWalletsAsset = async (wallet: string) => {
	
	const [conet_balance, cntp_balance] = await Promise.all([
		CONET_Holesky_RPC.getBalance(wallet),
		sendCNTP_v2_New_ChainContract.balanceOf(wallet)
	])
	logger(Colors.gray(`wallet [${wallet}] CONET = ${conet_balance} , CNTP ${cntp_balance}`))
}

const test = async (wallet: string) => {
	await getWalletsAsset (wallet)
}

test('0xee81CB4Ddf9350b0DEbA244A977Ed7dfc2b6A6F6')