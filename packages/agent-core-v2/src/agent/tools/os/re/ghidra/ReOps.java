import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.symbol.Reference;

public class ReOps extends GhidraScript {

    @Override
    public void run() throws Exception {
        String op = args.length > 0 ? args[0] : "decompile";
        String outPath = args[args.length - 1];
        PrintWriter out = new PrintWriter(new FileWriter(new File(outPath)));
        try {
            if (op.equals("list_functions")) {
                listFunctions(out);
            } else if (op.equals("decompile")) {
                decompile(out);
            } else if (op.equals("xrefs_to")) {
                xrefsTo(out);
            } else if (op.equals("call_graph")) {
                callGraph(out);
            } else if (op.equals("rename")) {
                rename(out);
            } else {
                out.println("{\"error\":\"unknown operation: " + op + "\"}");
            }
        } catch (Exception e) {
            out.println("{\"error\":\"" + String.valueOf(e).replace("\"", "\\\"") + "\"}");
        } finally {
            out.flush();
            out.close();
        }
    }

    private void listFunctions(PrintWriter out) throws Exception {
        List<Map<String, Object>> funcs = new ArrayList<>();
        for (Function fn : currentProgram.getFunctionManager().getFunctions(true)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("name", fn.getName());
            m.put("addr", "0x" + Long.toHexString(fn.getEntryPoint().getOffset()));
            m.put("size", fn.getBody().getNumAddresses());
            try {
                m.put("signature", String.valueOf(fn.getSignature()));
            } catch (Exception e) {
                m.put("signature", "");
            }
            funcs.add(m);
        }
        out.println(toJson(funcs));
    }

    private void decompile(PrintWriter out) throws Exception {
        String target = args.length > 1 ? args[1] : "";
        Function fn = resolveFunction(target);
        if (fn == null) {
            out.println("{\"error\":\"Function not found: " + target + "\"}");
            return;
        }
        DecompInterface decomp = new DecompInterface();
        decomp.openProgram(currentProgram);
        DecompileResults res = decomp.decompileFunction(fn, 60, monitor);
        if (res != null && res.decompileCompleted()) {
            out.print(res.getDecompiledFunction().getC());
        } else {
            out.println("{\"error\":\"decompilation failed\"}");
        }
    }

    private void xrefsTo(PrintWriter out) throws Exception {
        String target = args.length > 1 ? args[1] : "";
        Address addr = currentProgram.getAddressFactory().getDefaultAddressSpace().getAddress(parseHex(target));
        List<Map<String, Object>> refs = new ArrayList<>();
        for (Reference ref : currentProgram.getReferenceManager().getReferencesTo(addr)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("from", "0x" + Long.toHexString(ref.getFromAddress().getOffset()));
            m.put("type", String.valueOf(ref.getReferenceType().getName()));
            m.put("is_call", ref.getReferenceType().isCall());
            refs.add(m);
        }
        out.println(toJson(refs));
    }

    private void callGraph(PrintWriter out) throws Exception {
        String target = args.length > 1 ? args[1] : "";
        int depth = args.length > 2 ? Integer.parseInt(args[2]) : 3;
        Function root = resolveFunction(target);
        if (root == null) {
            out.println("{\"error\":\"Function not found: " + target + "\"}");
            return;
        }
        Map<String, Object> graph = new LinkedHashMap<>();
        graph.put("root", root.getName());
        List<Map<String, String>> callers = new ArrayList<>();
        graph.put("callers", callers);
        List<Function> frontier = new ArrayList<>();
        frontier.add(root);
        java.util.Set<Long> seen = new java.util.HashSet<>();
        for (int i = 0; i < Math.max(1, depth); i++) {
            List<Function> nxt = new ArrayList<>();
            for (Function fn : frontier) {
                long key = fn.getEntryPoint().getOffset();
                if (seen.contains(key)) continue;
                seen.add(key);
                for (Reference ref : currentProgram.getReferenceManager().getReferencesTo(fn.getEntryPoint())) {
                    Function frm = currentProgram.getFunctionManager().getFunctionContaining(ref.getFromAddress());
                    if (frm == null) continue;
                    Map<String, String> m = new LinkedHashMap<>();
                    m.put("from", frm.getName());
                    m.put("to", fn.getName());
                    callers.add(m);
                    nxt.add(frm);
                }
            }
            frontier = nxt;
        }
        out.println(toJson(graph));
    }

    private void rename(PrintWriter out) throws Exception {
        String target = args.length > 1 ? args[1] : "";
        String name = args.length > 2 ? args[2] : "";
        Function fn = resolveFunction(target);
        if (fn == null) {
            out.println("{\"error\":\"Function not found: " + target + "\"}");
            return;
        }
        fn.setName(name, false);
        out.println("{\"renamed\":\"" + fn.getName() + "\"}");
    }

    private Function resolveFunction(String target) {
        try {
            Address addr = currentProgram.getAddressFactory().getDefaultAddressSpace().getAddress(parseHex(target));
            Function fn = currentProgram.getFunctionManager().getFunctionAt(addr);
            if (fn != null) return fn;
        } catch (Exception e) {
        }
        for (Function fn : currentProgram.getFunctionManager().getFunctions(true)) {
            if (fn.getName().equals(target)) return fn;
        }
        return null;
    }

    private long parseHex(String s) {
        String t = s.trim();
        if (t.startsWith("0x") || t.startsWith("0X")) t = t.substring(2);
        return Long.parseLong(t, 16);
    }

    private String toJson(Object obj) throws Exception {
        if (obj instanceof Map) {
            StringBuilder sb = new StringBuilder("{");
            boolean first = true;
            for (Map.Entry<?, ?> e : ((Map<?, ?>) obj).entrySet()) {
                if (!first) sb.append(",");
                first = false;
                sb.append("\"").append(esc(String.valueOf(e.getKey()))).append("\":").append(toJson(e.getValue()));
            }
            sb.append("}");
            return sb.toString();
        }
        if (obj instanceof List) {
            StringBuilder sb = new StringBuilder("[");
            boolean first = true;
            for (Object o : (List<?>) obj) {
                if (!first) sb.append(",");
                first = false;
                sb.append(toJson(o));
            }
            sb.append("]");
            return sb.toString();
        }
        if (obj instanceof Number || obj instanceof Boolean) {
            return String.valueOf(obj);
        }
        return "\"" + esc(String.valueOf(obj)) + "\"";
    }

    private String esc(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
