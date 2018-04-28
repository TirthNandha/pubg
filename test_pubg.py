#coding:utf8
import httplib
import os
import unittest
import urllib

import requests

timeout = 3.0
nickname = "..."
accountId = "account.5ca..."
steam64Id = "765..."

def testRespBroUserStats(self, r):
    self.assertEqual(r.status_code, httplib.OK)
    resp = r.json()

    self.assertEqual(resp["code"], httplib.OK)
    self.assertEqual(len(resp["result"]), 1)

    infoPlayer = resp["result"][0]

    self.assertEqual(infoPlayer["AccountId"], accountId)
    self.assertEqual(infoPlayer["Nickname"], nickname)
    self.assertTrue(infoPlayer["AvatarUrl"].startswith("http"))
    self.assertTrue(infoPlayer["AvatarUrl"].endswith(".jpg"))


class Test(unittest.TestCase):
    def __init__(self, *args, **kwargs):
        super(Test, self).__init__(*args, **kwargs)

        PWD = os.path.dirname(os.path.realpath(__file__))
        self.PATH_PROJ_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(PWD)))

    """
    Get Bro User States by accountId/nickname/steam64id
    """
    def testGetBroUserStatesByAccountId(self):
        url = 'http://localhost:3000/GetBroUserStatesByAccountId/{accountId}'.format(
            accountId=accountId,
        )
        r = requests.get(
            url=url,
            timeout=timeout,
        )

        testRespBroUserStats(self=self, r=r)

    def testGetBroUserStatesByNickname(self):
        url = 'http://localhost:3000/GetBroUserStatesByNickname/{nickname}'.format(
            nickname=nickname,
        )

        r = requests.get(
            url=url,
            timeout=timeout,
        )

        testRespBroUserStats(self=self, r=r)

    def testGetBroUserStatesBySteamId(self):
        url = 'http://localhost:3000/GetBroUserStatesBySteamId/{steam64Id}'.format(
            steam64Id=steam64Id,
        )

        r = requests.get(
            url=url,
            timeout=timeout,
        )

        testRespBroUserStats(self=self, r=r)



    def testGetUserRecord(self):
        for rankType in (
            "solo",
            "duo",
            "squad",
        ):
            for region in (
                "na",
                "as",
                "eu",
            ):
                url = 'http://localhost:3000/GetUserRecord?accountId={accountId}&rankType={mode}&region={server}'.format(
                    accountId=accountId,
                    mode=rankType,
                    server=region,
                )

                r = requests.get(
                    url=url,
                    timeout=timeout,
                )
                self.assertEqual(httplib.OK, r.status_code)

                resp = r.json()
                self.assertEqual(httplib.OK, resp["code"])

                infoStat = resp["result"]
                self.assertEqual(region, infoStat["Region"])
                self.assertEqual(rankType, infoStat["Match"])
                self.assertEqual(accountId, infoStat["AccountId"])
                self.assertEqual(nickname, infoStat["Nickname"])

                for field in (
                    "Ranks",
                    "Records",
                ):
                    self.assertIn(field, infoStat)



    """
    Get Bro Leaderboard 
    """
    def testGetBroLeaderboard(self):
        parameters = {"rankType":"solo", "type": "Rating", "region": "eu"}
        url = 'http://localhost:3000/GetBroLeaderboard?' + urllib.urlencode(parameters)
        r = requests.get(
            url=url,
            timeout=timeout,
        )
        self.assertEqual(httplib.OK, r.status_code)

        resp = r.json()
        self.assertEqual(httplib.OK, resp["code"])

        infoStat = resp["result"]
        self.assertEqual(parameters["region"], infoStat["Region"])
        self.assertEqual(parameters["type"], infoStat["Domain"])
        for field in (
            "Leaders",
            "User",
        ):
            self.assertIn(field, infoStat)

        for infoLeader in resp["result"]["Leaders"]:
            for field in (
                    "AccountId",
                    "Nickname",
                    "Wins",
                    "Rank",
                    "Rating",
            ):
                self.assertIn(field, infoLeader)

if __name__ == '__main__':
    unittest.main()
