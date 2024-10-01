import {ethers} from 'ethers'
import {logger, masterSetup} from './util'
import dailyTaskABI from './dailyTask.ABI.json'
import Colors from 'colors/safe'
import {inspect} from 'node:util'

const dailyTaskAddr = '0x4651B8ED42aB3e9e325B1a3bAACF2fDC103BBd6f'
const provider = new ethers.JsonRpcProvider('https://rpc.conet.network')
const managerWallet = new ethers.Wallet(masterSetup.constGAMEAccount[1], provider)
export const dailyTaskSC = new ethers.Contract(dailyTaskAddr, dailyTaskABI, managerWallet)


const changeTodaysHash = async (text: string) => {
	logger(Colors.blue(text))
	try {
		const tx = await dailyTaskSC.changeTodaysHash(text)
		logger(Colors.black(`Send transfer ${tx.hash} success then waiting confirm! `))
		const ts = await tx.wait()
		logger(inspect(ts))
	} catch (ex: any) {
		logger(Colors.red(`changeTodaysHash got Error`), ex.message)
		return 
	}
}

export const getDailyIPAddressAndhashCheck = async (ipaddress: string, hashText: string) => {
	try {

		const result = await Promise.all([
			dailyTaskSC.todayIpAddressCount(ipaddress),
			dailyTaskSC.isMatchToday(hashText)
		])
		logger(Colors.blue(`getDailyIPAddressCheck check ${ipaddress} got result ${inspect(result, false, 3, true)}`))
		return result
	} catch (ex: any) {
		logger(Colors.red(`changeTodaysHash got Error`), ex.message)
		return null
	}
}




// changeTodaysHash(JSON.stringify(['https://www.sample.com?id=kkkk&oo=test', 'https://www.sample2.com']))