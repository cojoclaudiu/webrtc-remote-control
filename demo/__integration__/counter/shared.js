import { getE2eTestServerAddress, sleep } from "../../test.helpers";

const SAFE_TIMEOUT = 3;

export function getVisitInfosFromMode(mode) {
  const acceptedModes = ["react", "vanilla"];
  if (!acceptedModes.includes(mode)) {
    throw new Error(
      `mode ${mode} not supported, please pass one of ${acceptedModes.join(
        ", "
      )}`
    );
  }
  const infos = {
    vanilla: {
      url: "/counter-vanilla/master.html",
      title: "webrtc-remote-control / demo / vanilla / counter",
    },
    react: {
      url: "/counter-react/index.html",
      title: "webrtc-remote-control / demo / react / counter",
    },
  };
  return infos[mode];
}

export function givenIVisitDemoHomePage(given) {
  let masterPage = null;
  given("I visit demo home page", async () => {
    masterPage = await browser.newPage();
    await page.goto(getE2eTestServerAddress());
    await expect(page.title()).resolves.toMatch("webrtc-remote-control");
  });
  return {
    getMasterPage() {
      return masterPage;
    },
  };
}

export function givenIVisitMasterPage(
  given,
  pathname,
  title,
  { getMasterPage }
) {
  given("I visit master page", async () => {
    await getMasterPage().goto(`${getE2eTestServerAddress()}${pathname}`);
    await expect(getMasterPage().title()).resolves.toMatch(title);
  });
}

export function givenMasterPeerOpenEventIsTriggered(given, { getMasterPage }) {
  let masterPeerId = null;
  given("[master] triggers open event", async () => {
    const logs = await getMasterPage().evaluate(() => {
      return document.querySelector("console-display").data;
    });
    expect(logs[0].payload.event).toBe("open");

    // update `masterPeerId` so that it will be exposed
    masterPeerId = logs[0].payload.payload.id;

    await sleep(SAFE_TIMEOUT);
  });

  return function getMasterPeerId() {
    return masterPeerId;
  };
}

export function givenIOpenANewRemote(given, { getMasterPage }) {
  let remotePeerId = null;
  let remotePage = null;
  given(
    "I open a new remote from master, it should trigger an open event on remote",
    async () => {
      const remoteHref = await getMasterPage().evaluate(() => {
        return document.querySelector(".open-remote").href;
      });
      remotePage = await browser.newPage();
      await remotePage.goto(remoteHref);
      await expect(remotePage.url()).toBe(remoteHref);

      // check the events on the remote page
      const remoteLogs = await remotePage.evaluate(() => {
        return document.querySelector("console-display").data;
      });
      expect(remoteLogs[0].payload.event).toBe("open");

      // update `remotePeerId` so that it will be exposed
      remotePeerId = remoteLogs[0].payload.payload.id;

      await sleep(SAFE_TIMEOUT);
    }
  );

  return function getCurrentRemote() {
    return {
      peerId: remotePeerId,
      page: remotePage,
    };
  };
}

export function givenMasterAndRemoteEmitReceiveRemoteConnectEvent(
  given,
  { getCurrentRemote, getMasterPage }
) {
  given("[master] should receive remote.connect event", async () => {
    // check the events on the master page
    const masterLogs = await getMasterPage().evaluate(() => {
      return document.querySelector("console-display").data;
    });
    expect(masterLogs[0].payload).toEqual({
      event: "remote.connect",
      payload: {
        id: getCurrentRemote().peerId,
      },
    });

    await sleep(SAFE_TIMEOUT);
  });
}

export function givenICloseEveryPages(given, { getAllRemotes, getMasterPage }) {
  given("I close every pages", async () => {
    for (const getCurrentRemote of getAllRemotes()) {
      await getCurrentRemote().page.close();
    }
    await getMasterPage().close();
  });
}

export function givenIResetSessionStorage(
  given,
  { getAllRemotes, getMasterPage, getMasterPeerId }
) {
  given("I reset the sessionStorage of every pages", async () => {
    // remote pages
    for (const getCurrentRemote of getAllRemotes()) {
      const peerIdInStorage = await getCurrentRemote().page.evaluate(() => {
        return sessionStorage.getItem("webrtc-remote-control-peer-id");
      });
      // check the correct peerId was stored in sessionStorage
      expect(peerIdInStorage).toBe(getCurrentRemote().peerId);
      // cleanup
      await getCurrentRemote().page.evaluate(() => {
        return sessionStorage.removeItem("webrtc-remote-control-peer-id");
      });
    }

    // master pages
    const masterPeerIdInStorage = await getMasterPage().evaluate(() => {
      return sessionStorage.getItem("webrtc-remote-control-peer-id");
    });
    // check the correct peerId was stored in sessionStorage
    expect(masterPeerIdInStorage).toBe(getMasterPeerId());
    // cleanup
    await getMasterPage().evaluate(() => {
      return sessionStorage.removeItem("webrtc-remote-control-peer-id");
    });
  });
}

/**
 * Accepts in the feature a string "[0,1,2]" which will be matched to the counters
 * of the connected remotes.
 * No need to pass peerIds, they are derived via indexes.
 */
export function givenRemoteListShouldContain(
  given,
  { getAllRemotes, getMasterPage }
) {
  given(
    /^\[master\] remote lists should be "(.*)"$/,
    async (expectedSerializedRemoteCounters) => {
      // extract the counter list from the feature file and re-create an object-like
      // that was passed to <remotes-list/>
      const parsedRemoteCounters = JSON.parse(expectedSerializedRemoteCounters);
      const remotesListExpectedData = getAllRemotes().reduce(
        (acc, getCurrentRemote, index) => {
          if (getCurrentRemote().peerId) {
            acc.push({
              counter: parsedRemoteCounters[index],
              peerId: getCurrentRemote().peerId,
            });
          }
          return acc;
        },
        []
      );

      // match
      const remotesListCurrentData = await getMasterPage().evaluate(() => {
        return document.querySelector("remotes-list").data;
      });
      expect(remotesListCurrentData).toEqual(remotesListExpectedData);
    }
  );
}

/**
 * I click on (increment|decrement) X times on remote Y
 */
export function giventIClickTimesOnRemote(given, { getRemote }) {
  given(
    /^I click on (increment|decrement) (\d+) times on remote (\d+)$/,
    async (mode, times, remoteIndex) => {
      /**
       * We need to pass `selector` and `times` to puppeteer context
       */
      const fromPuppeteer = () => {
        const mapping = {
          increment: ".counter-control-add",
          decrement: ".counter-control-sub",
        };
        return {
          times: Number(times),
          selector: mapping[mode],
        };
      };
      await getRemote(Number(remoteIndex))().page.exposeFunction(
        "fromPuppeteer",
        fromPuppeteer
      );
      await getRemote(Number(remoteIndex))().page.evaluate(async () => {
        // eslint-disable-next-line no-shadow
        const { times, selector } = await window.fromPuppeteer();
        for (let i = 0; i < times; i++) {
          document.querySelector(selector).click();
        }
      });

      await sleep(SAFE_TIMEOUT);
    }
  );
}

export function givenIReloadARemoteThenMasterShouldReceiveDisconnectEvent(
  given,
  { getRemote, getMasterPage }
) {
  given(
    /^I reload remote (\d+) then master should receive remote.disconnect\/remote.connect event$/,
    async (remoteIndex) => {
      const remotePeerId = getRemote(remoteIndex)().peerId;
      await getRemote(remoteIndex)().page.reload();
      const remoteLogs = await getRemote(remoteIndex)().page.evaluate(
        async () => {
          return document.querySelector("console-display").data;
        }
      );
      // remote should re-open and re-use the same id
      expect(remoteLogs[0].payload.event).toBe("open");
      expect(remoteLogs[0].payload.payload.id).toBe(remotePeerId);

      // master should receive remote.disconnect/remote.connect
      const masterLogs = await getMasterPage().evaluate(async () => {
        return document.querySelector("console-display").data;
      });
      expect(masterLogs[1].payload).toEqual({
        event: "remote.disconnect",
        payload: {
          id: remotePeerId,
        },
      });
      expect(masterLogs[0].payload).toEqual({
        event: "remote.connect",
        payload: {
          id: remotePeerId,
        },
      });

      await sleep(SAFE_TIMEOUT);
    }
  );
}

export function givenIReloadMasterThenRemotesShouldReconnect(
  given,
  { getAllRemotes, getMasterPage }
) {
  given(
    "I reload master then all remotes should receive remote.disconnect/remote.reconnect",
    async () => {
      const expectedEventsOnMaster = getAllRemotes()
        .map((getRemote) => ({
          event: "remote.connect",
          payload: {
            id: getRemote().peerId,
          },
        }))
        .sort((a, b) => (a.payload.id > b.payload.id ? -1 : 1));
      await getMasterPage().reload();
      await sleep(SAFE_TIMEOUT * 100);

      // check remote connecting on master
      const masterLogs = await getMasterPage().evaluate(async () => {
        return document.querySelector("console-display").data;
      });
      const received = masterLogs
        .slice(0, 3)
        .map(({ payload }) => payload)
        .sort((a, b) => (a.payload.id > b.payload.id ? -1 : 1));
      expect(received).toEqual(expectedEventsOnMaster);

      // check on each remote if they receive remote.disconnect/remote.reconnect
      for (const getCurrentRemote of getAllRemotes()) {
        const remoteLogs = await getCurrentRemote().page.evaluate(async () => {
          return document.querySelector("console-display").data;
        });
        expect(remoteLogs[1].payload).toEqual({
          event: "remote.disconnect",
          payload: {
            id: getCurrentRemote().peerId,
          },
        });
        expect(remoteLogs[0].payload).toEqual({
          event: "remote.reconnect",
          payload: {
            id: getCurrentRemote().peerId,
          },
        });
      }
    }
  );
}

/**
 * Will setup all the backgroud steps
 */
export function setupBackground(given, mode) {
  const infos = getVisitInfosFromMode(mode);
  const remotes = [];
  const getAllRemotes = () => remotes;
  const addRemote = (remote) => {
    remotes.push(remote);
  };
  const setRemote = (remote, index) => {
    if (typeof index === "undefined") {
      throw new Error(`setRemote must be passed both remote and index`);
    }
    remotes[index] = remote;
  };
  const getRemote = (index) => remotes.at(index);
  const { getMasterPage } = givenIVisitDemoHomePage(given);
  givenIVisitMasterPage(given, infos.url, infos.title, { getMasterPage });
  const getMasterPeerId = givenMasterPeerOpenEventIsTriggered(given, {
    getMasterPage,
  });

  // open 3 remotes
  for (let i = 0; i < 3; i++) {
    addRemote(givenIOpenANewRemote(given, { getMasterPage }));
    givenMasterAndRemoteEmitReceiveRemoteConnectEvent(given, {
      getCurrentRemote: getRemote(-1),
      getMasterPage,
    });
    givenRemoteListShouldContain(given, { getAllRemotes, getMasterPage });
  }

  return {
    getAllRemotes,
    getRemote,
    addRemote,
    setRemote,
    getMasterPeerId,
    getMasterPage,
  };
}