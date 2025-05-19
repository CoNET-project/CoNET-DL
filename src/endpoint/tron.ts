import * as TronWeb from 'tronweb'
import crypto from 'node:crypto'
import { logger } from '../util/util'
import { inspect } from 'node:util'
import tron_USDT_ABI from './tron_USDT_ABI.json'


const fullNode = 'https://api.shasta.trongrid.io'
const solidityNode = 'https://api.shasta.trongrid.io'
const eventServer = 'https://api.shasta.trongrid.io'
var privateKey = crypto.randomBytes(32).toString('hex')

const tronWeb = new TronWeb.TronWeb({
    fullHost: fullNode
})

const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
const USDT_Decimal = 6

export const ethToTronAddress = (ethAddress: string) => {
    // Remove '0x' prefix
    const hex = ethAddress.replace(/^0x/, '')
    
    // Prefix with '41' (TRON address prefix)
    const tronHex = '41' + hex.toLowerCase()

    // Encode to Base58Check (TRON format)
    const tronAddress = tronWeb.address.fromHex(tronHex);
    return tronAddress
}



export const balanceTron = async (tronAddr: string) => {
    
    try {


        const ethAddr = tronToEthAddress (tronAddr)
        const balace =  await tronWeb.trx.getBalance(tronAddr)
        logger(inspect(balace, false, 3, true))
        const balanceInTRX = tronWeb.fromSun(balace)
        console.log(`Balance of ${tronAddr}:${ethAddr} = ${balanceInTRX} TRX`)
    } catch (ex: any) {
        console.error("Failed to fetch balance:", ex.message)
    }
}

export const getAccount = async(tronAddr: string) => {
    try {
        const accountInfo = await tronWeb.trx.getAccount(tronAddr)
        logger(inspect(accountInfo, false, 3, true))
    } catch (ex: any) {
        console.error("Failed to fetch balance:", ex.message)
    }
}

export const tronToEthAddress = (tronAddr: string) => {
    const hex = tronWeb.address.toHex(tronAddr) // e.g., 41 + 20-byte address
    if (!hex.startsWith('41')) {
        throw new Error('Invalid TRON hex address')
    }
    return '0x' + hex.slice(2) // drop '41', add '0x'
}



export const getBalance_USDT = async (tronAddr: string) => {
    const ethAddr = tronToEthAddress (tronAddr)
    tronWeb.setAddress(tronAddr)
    const {
        abi
    } = await tronWeb.trx.getContract(USDT_CONTRACT)
    const contract = await tronWeb.contract(tron_USDT_ABI, USDT_CONTRACT)
    
    const result = await contract.balanceOf(tronAddr).call()
    const balance = tronWeb.toBigNumber(result).div(10 ** USDT_Decimal).toString()
    console.log(`${tronAddr}:${ethAddr} USDT Balance: ${balance} USDT`)
}

const test = () => {
    const account = 'TEKZGDktKqs68agSYTsnkkJa8LHhRP8HCW'
    // balanceTron(account)
    // getAccount(account)
    getBalance_USDT(account)
}

test()