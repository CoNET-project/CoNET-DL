import { logger } from "./util"

const reword = (addedStaking: number) => {

	const totakStaking = 900 + addedStaking
	const returnRate = 0.5
	const totalMins = 43200
	const hoursRate = returnRate / (totalMins * 12)
    const totakStaking_min = 900 / totalMins
    logger(hoursRate)
    let reword = 0

    for (let k = totalMins, pp = 0, stak = totakStaking; k > 0; k --, pp ++, stak -=totakStaking_min) {
        reword += stak * hoursRate
        const kkk = pp % 100
        if (kkk === 0) {
            logger (`pp[${pp}], stak [${stak}] reword [${reword}]`)
        }
    }
}

reword(900)