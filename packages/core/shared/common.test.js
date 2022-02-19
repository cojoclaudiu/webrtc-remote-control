import { mockSessionStorage } from "../test.helpers";
import { makeStoreAccessor } from "./common";

let sessionStorage = null;

describe("shared/common", () => {
  beforeAll(() => {
    sessionStorage = mockSessionStorage();
  });
  describe("makeStoreAccessor", () => {
    afterEach(() => {
      sessionStorage.clear();
    });
    it("should persist state with default key", () => {
      const { getPeerId, setPeerIdToSessionStorage } = makeStoreAccessor();
      expect(getPeerId()).toBeFalsy();

      setPeerIdToSessionStorage("foo");

      expect(getPeerId()).toBe("foo");
      expect(sessionStorage.getItem("webrtc-remote-control-peer-id")).toBe(
        "foo"
      );
    });
    it("should persist state with default key", () => {
      const { getPeerId, setPeerIdToSessionStorage } =
        makeStoreAccessor("some-other-key");
      expect(getPeerId()).toBeFalsy();

      setPeerIdToSessionStorage("bar");

      expect(getPeerId()).toBe("bar");
      expect(sessionStorage.getItem("some-other-key")).toBe("bar");
    });
  });
});
