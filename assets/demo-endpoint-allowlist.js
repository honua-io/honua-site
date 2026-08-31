(() => {
  const fixture = document.querySelector("#fixture-endpoint-option");
  if (fixture) fixture.value = new URL(fixture.getAttribute("value"), window.location.origin).href;
})();
