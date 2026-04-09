import { TwitterApi } from "twitter-api-v2"
import { config } from "../config.js"

const createClient = (): TwitterApi | null => {
  const { twitterApiKey, twitterApiSecret, twitterAccessToken, twitterAccessTokenSecret } = config

  if (!twitterApiKey || !twitterApiSecret || !twitterAccessToken || !twitterAccessTokenSecret) {
    return null
  }

  return new TwitterApi({
    appKey: twitterApiKey,
    appSecret: twitterApiSecret,
    accessToken: twitterAccessToken,
    accessSecret: twitterAccessTokenSecret,
  })
}

export const twitterClient = createClient()
