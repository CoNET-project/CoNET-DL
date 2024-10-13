import {ethers} from 'ethers'
import { logger } from './logger'
import Colors from 'colors/safe'
import ticketABI from './ABI/ticket.json'
import cntpABI from './cCNTP_v5.json'

const provider = new ethers.JsonRpcProvider('https://rpc.conet.network')
const ticketContract = new ethers.Contract('0x92a033A02fA92169046B91232195D0E82b8017AB', ticketABI, provider)
const cntpContract = new ethers.Contract('0xa4b389994A591735332A67f3561D60ce96409347', cntpABI, provider)

const getBalanceCNTP = async (wallet: string) => {
	const balance = await cntpContract.balanceOf (wallet)
	return balance
}


const getBalanceTicket = async (wallet: string, tokenID: number) => {
	const balance = await ticketContract.balanceOf(wallet, tokenID)
	return balance
}


const start = async (wallet: string) => {
	
	const epoch = await provider.getBlockNumber()

	const ba = await getBalanceTicket(wallet, 1)
	

	const [ba1, ba2] = await Promise.all([
		await getBalanceTicket(wallet, 1),
		await getBalanceCNTP(wallet)
	])
	const initCNTP = ethers.formatEther(ba2.toString())
	const initTicket = parseInt(ba1.toString())
	logger(Colors.blue(`Start listen ${wallet} with epoch ${epoch} CNTP = [${initCNTP}] Ticket = [${initTicket}]`))

	provider.on('block', async block => {
		const [ba3, ba4] = await Promise.all([
			await getBalanceTicket(wallet, 1),
			await getBalanceCNTP(wallet)
		])
		
		const updateTicket = parseInt(ba3.toString()) - initTicket
		const newBalanceCNTP = ethers.formatEther(ba4.toString())
		const updateCNTP = parseFloat(newBalanceCNTP) - parseFloat(initCNTP)

		logger(Colors.blue(`epoch ${block} ticket ${ba3.toString()}:${updateTicket} CNTP ${newBalanceCNTP}:${updateCNTP}`))
	})
}

const [,,...args] = process.argv
const wallet = args[0]

if ( wallet ) {
	start (wallet)
}