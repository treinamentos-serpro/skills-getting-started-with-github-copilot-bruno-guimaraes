const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const vm = require("node:vm");

const source = readFileSync(`${__dirname}/../src/static/app.js`, "utf8");

class Element {
  constructor() {
    this.children = [];
    this.listeners = {};
    this.classList = { add() {}, remove() {} };
    this.value = "";
  }

  set innerHTML(value) {
    this.html = value;
    this.children = [];
  }

  get innerHTML() {
    return this.html;
  }

  appendChild(child) {
    child.parent = this;
    this.children.push(child);
  }

  remove() {
    this.parent.children = this.parent.children.filter((child) => child !== this);
  }

  querySelectorAll() {
    return this.children.slice(1);
  }

  addEventListener(name, listener) {
    this.listeners[name] = listener;
  }

  setAttribute() {}

  reset() {
    this.wasReset = true;
  }
}

async function setup(signupOk = true) {
  const elements = Object.fromEntries(
    ["activities-list", "activity", "signup-form", "message", "email"].map(
      (id) => [id, new Element()]
    )
  );
  elements.activity.appendChild(new Element());
  const participants = [];
  const requests = [];
  vm.runInNewContext(source, {
    document: {
      getElementById: (id) => elements[id],
      createElement: () => new Element(),
      addEventListener: (_name, listener) => listener(),
    },
    fetch: async (url, options) => {
      requests.push({ url, method: options?.method || "GET" });
      if (options?.method === "POST") {
        if (signupOk) participants.push(elements.email.value);
        return {
          ok: signupOk,
          json: async () => ({ message: "Signed up", detail: "Already registered" }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          "Chess Club": {
            description: "Play chess",
            schedule: "Monday",
            max_participants: 2,
            participants: [...participants],
          },
        }),
      };
    },
    console,
    setTimeout: () => {},
  });
  await new Promise(setImmediate);
  elements.activity.value = "Chess Club";
  return { elements, requests };
}

test("successful signups refresh participants and availability without duplicating options", async () => {
  const { elements, requests } = await setup();
  for (const [index, email] of ["first@example.com", "second@example.com"].entries()) {
    elements.email.value = email;
    await elements["signup-form"].listeners.submit({ preventDefault() {} });

    const cards = elements["activities-list"].children;
    assert.equal(cards.length, 1);
    assert.match(cards[0].innerHTML, new RegExp(`${1 - index} spots left`));
    const participants = cards[0].children[0];
    assert.equal(participants.children[0].textContent, `Participants (${index + 1})`);
    assert.equal(participants.children[1].children[index].children[0].textContent, email);
    assert.equal(elements.activity.children.length, 2);
    assert.equal(elements["signup-form"].wasReset, true);
    assert.equal(elements.message.className, "success");
  }
  assert.deepEqual(requests.map(({ method }) => method), ["GET", "POST", "GET", "POST", "GET"]);
  assert.equal(requests[1].url, "/activities/Chess%20Club/signup?email=first%40example.com");
});

test("rejected signups keep the current cards and display the API error", async () => {
  const { elements, requests } = await setup(false);
  const card = elements["activities-list"].children[0];
  await elements["signup-form"].listeners.submit({ preventDefault() {} });
  assert.equal(elements["activities-list"].children[0], card);
  assert.equal(elements.message.textContent, "Already registered");
  assert.equal(elements.message.className, "error");
  assert.equal(elements["signup-form"].wasReset, undefined);
  assert.equal(requests.length, 2);
});
