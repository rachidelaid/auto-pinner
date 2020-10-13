const { ipcRenderer } = require("electron");
const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");

const adapter = new FileSync("db.json");
const db = low(adapter);
db.defaults({ data: [], settings: {} }).write();

new Vue({
  el: "#app",
  data() {
    return {
      pinPassword: null,
      pinUsername: null,
      affiliateID: null,
      delay: 30,
      accounts: [],
      lists: [],
      currentItem: null,
      oldDesc: "",
      progress: 0,
      progressSVG: 350,
      boardUrl: "",
      doneL: 0,
      count: 0,
    };
  },
  methods: {
    addAccount() {
      if (this.pinUsername != null && this.pinPassword != null) {
        const obj = {
          pass: this.pinPassword,
          user: this.pinUsername,
        };

        this.accounts.push(obj);

        db.set("settings.accounts", JSON.stringify(this.accounts)).write();

        //localStorage.setItem("accounts", JSON.stringify(this.accounts));

        this.pinPassword = null;
        this.pinUsername = null;
      }
    },
    closeSetting() {
      document.querySelector("#setting").style.display = "none";
      document.querySelector("#home").style.display = "block";
    },
    save() {
      if (this.affiliateID != null) {
        //localStorage.setItem("affiliateID", this.affiliateID);
        db.set("settings.affiliateID", this.affiliateID).write();
      }

      if (this.delay != null) {
        //localStorage.setItem("pinDelay", this.delay);
        db.set("settings.pinDelay", this.delay).write();
      }

      const acc = document.querySelector("#accounts").value;
      //localStorage.setItem("selectedACC", acc);
      db.set("settings.selectedACC", acc).write();

      const hide = document.querySelector("#hidden").value;
      //localStorage.setItem("hidden", hide);
      db.set("settings.hidden", hide).write();

      document.querySelector("#setting").style.display = "none";
      document.querySelector("#home").style.display = "block";
    },
    showSetting() {
      document.querySelector("#home").style.display = "none";
      document.querySelector("#setting").style.display = "block";
    },
    loadJSON() {
      document.querySelector(".confirmJSON").style.display = "flex";
    },
    cancelJSON() {
      document.querySelector(".confirmJSON").style.display = "none";
    },
    replaceJSON() {
      document.querySelector("#jsonInput").click();
      document.querySelector(".confirmJSON").style.display = "none";

      document.querySelector("#jsonInput").addEventListener("change", (e) => {
        const data = require(e.target.files[0].path);

        db.set("data", [...data]).write();

        this.lists = [];
        this.lists = db.get("data").value();
      });
    },
    appendJSON() {
      document.querySelector("#jsonInput").click();
      document.querySelector(".confirmJSON").style.display = "none";

      document.querySelector("#jsonInput").addEventListener("change", (e) => {
        const data = require(e.target.files[0].path);
        
        db.get("data").push(...data).write();

        this.lists = [];
        this.lists = db.get("data").value();
      });
    },
    edit(list, i) {
      this.currentItem = { ...list };
      this.currentItem.id = i;

      this.oldDesc = list.desc;
      document.querySelector(".editItem").style.display = "flex";
    },
    closeEdit() {
      document.querySelector(".editItem").style.display = "none";
      this.lists = [];
      this.lists = db.get("data").value();
    },
    deleteItem(link) {
      document.querySelector(".editItem").style.display = "none";
      db.get("data").remove({ link }).write();

      this.lists = [];
      this.lists = db.get("data").value();
    },
    saveItem() {
      document.querySelector(".editItem").style.display = "none";

      let id = this.currentItem.id;
      delete this.currentItem.id;

      this.lists[id] = this.currentItem;

      db.set("data", [...this.lists]).write();

      this.lists = [];
      this.lists = db.get("data").value();
    },
    post() {
      document.querySelector(".beforePosting").style.display = "flex";
      document.querySelector("input#board").focus();
    },
    unpost() {
      document.querySelector(".beforePosting").style.display = "none";
    },
    start() {
      if (this.boardUrl.trim() != "") {
        document.querySelector(".beforePosting").style.display = "none";
        document.querySelector(".posting").style.display = "flex";

        let username;
        let pass;

        for (let i = 0; i < this.accounts.length; i++) {
          const element = this.accounts[i];
          if (document.querySelector("#accounts").value === element.user) {
            username = element.user;
            pass = element.pass;
          }
        }

        this.count = this.lists.length;

        ipcRenderer.send("post-pin", {
          hidden: document.querySelector("#hidden").value,
          affiliateID: this.affiliateID,
          data: this.lists,
          board: this.boardUrl,
          delay: this.delay,
          username,
          pass,
        });
      }
    },
  },
  mounted() {
    const data = db.get("data").value();
    if (data.length > 0) {
      this.lists = data;
    }

    const settings = db.get("settings").value();

    if (settings.accounts) {
      this.accounts = [...JSON.parse(settings.accounts)];
    }

    if (settings.affiliateID) {
      this.affiliateID = settings.affiliateID;
    }

    if (settings.pinDelay) {
      this.delay = settings.pinDelay;
    }

    if (settings.selectedACC) {
      setTimeout(() => {
        document.querySelector("#accounts").value = settings.selectedACC;
      }, 100);
    }

    if (settings.hidden) {
      setTimeout(() => {
        document.querySelector("#hidden").value = settings.hidden;
      }, 100);
    }

    ipcRenderer.on("progress", (event, link) => {
      db.get("data").remove({ link }).write();
      this.lists = [];
      this.lists = db.get("data").value();

      this.progressSVG -= 350 / this.count;
      this.doneL++;

      if (this.progressSVG <= 0) {
        this.progress = 100;
      } else {
        this.progress += parseInt(100 / this.count);
      }
    });

    ipcRenderer.on("update", (event, update) => {
      document.querySelector(".posting label").innerText = update;
    });

    ipcRenderer.on("error", (event, error) => {
      console.log(error);
    });

    ipcRenderer.on("finished", (event, error) => {
      document.querySelector(".posting").style.display = "none";
    });
  },
});
