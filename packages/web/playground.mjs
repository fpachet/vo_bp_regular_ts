import { datasets } from "../../examples/datasets.mjs";
const $ = (id) => document.getElementById(id);
let worker;
const render = ({ data }) => {
  for (const id of ["sample", "best"]) $(id).disabled = false;
  if (data.error) {
    $("status").textContent = data.error;
    return;
  }
  $("status").textContent = data.feasible
    ? "Completed."
    : "No positive-mass sequence satisfies these constraints.";
  const xs = data.sequence;
  $("output").textContent = xs
    ? xs.join(
        $("dataset").value === "journeys"
          ? " → "
          : $("dataset").value === "melody"
            ? " "
            : "",
      )
    : "Infeasible";
  $("diagnostics").replaceChildren();
  for (const [k, v] of Object.entries(data.diagnostics)) {
    const dt = document.createElement("dt"),
      dd = document.createElement("dd");
    dt.textContent = k;
    dd.textContent = Number.isInteger(v) ? v : String(Number(v.toPrecision(7)));
    $("diagnostics").append(dt, dd);
  }
};
function run(action) {
  if (worker) worker.terminate();
  worker = new Worker(new URL("./worker.mjs", import.meta.url), {
    type: "module",
  });
  worker.onmessage = render;
  worker.onerror = (e) => render({ data: { error: e.message } });
  const length = Number($("length").value),
    order = Number($("order").value);
  if (
    !Number.isSafeInteger(length) ||
    length < 0 ||
    length > 2000 ||
    !Number.isSafeInteger(order) ||
    order < 0 ||
    order > 8
  ) {
    render({
      data: { error: "Choose integer length 0–2000 and source order 0–8." },
    });
    return;
  }
  for (const id of ["sample", "best"]) $(id).disabled = true;
  $("status").textContent = "Computing reachable product and backward values…";
  worker.postMessage({
    action,
    dataset: $("dataset").value,
    length,
    order,
    prefix: $("prefix").value,
    suffix: $("suffix").value,
    forbidden: $("forbidden").value,
    required: $("required").value,
    copyLimit: $("copy").value === "" ? null : Number($("copy").value),
    position: Number($("position").value),
    positionSymbol: $("positionSymbol").value,
    custom: $("custom").value,
  });
}
$("sample").onclick = () => run("sample");
$("best").onclick = () => run("best");
$("dataset").onchange = () => {
  const name = $("dataset").value,
    d = datasets[name],
    sep = name === "melody" || name === "journeys" ? "," : "";
  $("order").value = d.maxOrder;
  $("length").value = d.length;
  $("prefix").value = d.prefix.join(sep);
  $("suffix").value = d.suffix.join(sep);
  $("forbidden").value = d.forbidden?.[0] ?? "";
  $("required").value = d.required?.join(sep) ?? "";
  $("copy").value = d.copyLimit ?? "";
  $("custom").value = "";
  $("positionSymbol").value = "";
};
