
import { logger } from './logger'
import Colors from 'colors/safe'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import TelegramBot from "node-telegram-bot-api"

const chatId = '@conettest'			//'-2357293635'



interface account {
	account: string
	passwd: string
	postAccount: string
}

export const _searchAccount: (telegramAccount: number) => Promise<TGResult> = (telegramAccount) => new Promise(resolve => {
	

	if (!bot) {
		const result: TGResult = {
			status: 501,
			message: 'CONET Telegram account check Bot has issue',
			isInTGGroup: false
		}
		return resolve(result)
	}

	const result: TGResult = {
		status: 200,
		isInTGGroup: false,
		userID: telegramAccount
	}

	if (!telegramAccount||isNaN(telegramAccount)) {
		result.message = `Your Telegram Accout incorrect`
		result.status = 502
		return resolve(result)
	}

	bot.getChatMember(chatId, telegramAccount).then(async () => {
		result.isInTGGroup = true
		return resolve(result)

	}).catch(async ex => {
		return resolve(result)
	})
})


let bot: TelegramBot|null = null

const startTeleBot = async (BOT_TOKEN: string) => {
	bot = new TelegramBot(BOT_TOKEN, {polling: true})
	logger(Colors.blue(`BOT_TOKEN = ${BOT_TOKEN}`))

	bot.on('message', message => {
		logger(Colors.blue(`bot.on('channel_post'`))
		const chatId = message?.chat?.id
		const msg = chatId && message?.text && /^\/id$/.test(message?.text)? `Your ID is ${chatId}`: null
			
		
		if (bot && chatId && msg) {
			return bot.sendMessage(chatId, msg)
		}
		
	})
	//		'@conettest'
	//	bot.sendMessage('@conettest', 'hello')
}
let startProcess = false
export const start = async () => {
	if (startProcess) {
		return
	}
	startProcess = true
	const filePath = join(__dirname,'.telegram.token')
	logger(Colors.magenta(`filePath ${filePath}`))
	const kk = readFileSync(filePath,'utf-8')
	const account: account = JSON.parse(kk)
	startTeleBot(account.account)
}

