"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScrollArea } from "@src/components/ui/scroll-area";
import { Card, CardContent, CardHeader } from "@src/components/ui/card";
import { Badge } from "@src/components/ui/badge";
import { Button } from "@src/components/ui/button";
import {
  Loader2,
  BookOpen,
  Clock,
  Tag,
  Play,
  Plus,
  CheckCircle2,
  FlaskConical,
  AlertTriangle
} from "lucide-react";
import type {
  RecipeRegistryRow,
  RecipeRegistryVersionRow
} from "@src/contracts/ui/recipe-registry.schema";
import { startRunFromRecipe } from "@src/lib/run-client";
import { formatDate, formatDateTime } from "@src/lib/time";

export function RecipeRegistryBoard() {
  const [recipes, setRecipes] = useState<RecipeRegistryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [versions, setVersions] = useState<RecipeRegistryVersionRow[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [startingRun, setStartingRun] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/recipes")
      .then((res) => res.json())
      .then((data) => {
        setRecipes(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch recipes:", err);
        setLoading(false);
      });
  }, []);

  const handleSelectRecipe = (id: string) => {
    setSelectedId(id);
    setVersionsLoading(true);
    fetch(`/api/recipes/${id}/versions`)
      .then((res) => res.json())
      .then((data) => {
        setVersions(data);
        setVersionsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch versions:", err);
        setVersionsLoading(false);
      });
  };

  const handleStartRun = async (recipeId: string, version: string) => {
    setStartingRun(version);
    try {
      // For demo purposes, we use empty formData.
      // In a real app, this would open a form based on recipe.formSchema.
      const res = await startRunFromRecipe({
        recipeRef: { id: recipeId, v: version },
        formData: {}
      });
      router.push(`/?wid=${res.workflowID}`);
    } catch (error) {
      console.error("Failed to start run from recipe:", error);
      alert("Failed to start run: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setStartingRun(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const selectedRecipe = recipes.find((r) => r.id === selectedId);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      <div className="flex-1 flex overflow-hidden">
        {/* Recipe List */}
        <div className="w-1/3 border-r flex flex-col overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between shrink-0">
            <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              Recipes
            </h2>
            <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1">
              <Plus className="w-3 h-3" />
              Import
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {recipes.map((recipe) => (
                <button
                  key={recipe.id}
                  onClick={() => handleSelectRecipe(recipe.id)}
                  className={`w-full text-left p-3 rounded-md transition-colors ${
                    selectedId === recipe.id ? "bg-accent" : "hover:bg-accent/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{recipe.name}</div>
                      <div className="text-[10px] font-mono text-muted-foreground truncate">
                        {recipe.id}
                      </div>
                    </div>
                    <Badge
                      variant={recipe.status === "stable" ? "default" : "secondary"}
                      className="text-[9px] h-4 shrink-0"
                    >
                      {recipe.status}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Tag className="w-3 h-3" />
                      {recipe.latestV}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(recipe.updatedAt)}
                    </span>
                  </div>
                </button>
              ))}
              {recipes.length === 0 && (
                <div className="p-8 text-center text-muted-foreground text-xs italic">
                  No recipes found.
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Version History / Details */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedId ? (
            <>
              <div className="p-4 border-b shrink-0 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold truncate">
                    {selectedRecipe?.name || selectedId}
                  </h2>
                  <p className="text-[10px] font-mono text-muted-foreground">{selectedId}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-8 text-xs">
                    Export Bundle
                  </Button>
                </div>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    {versionsLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      versions.map((v) => (
                        <Card key={v.v} className="overflow-hidden border-muted">
                          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                            <div className="flex items-center gap-3">
                              <div className="font-mono text-sm font-bold">{v.v}</div>
                              <Badge
                                variant={
                                  v.status === "stable"
                                    ? "default"
                                    : v.status === "candidate"
                                      ? "secondary"
                                      : "outline"
                                }
                                className="text-[9px] h-4"
                              >
                                {v.status}
                              </Badge>
                              <span className="text-[10px] font-mono text-muted-foreground">
                                {v.hash.substring(0, 8)}...
                              </span>
                            </div>
                            <Button
                              size="sm"
                              className="h-8 text-xs gap-1.5"
                              disabled={startingRun === v.v}
                              onClick={() => handleStartRun(v.id, v.v)}
                            >
                              {startingRun === v.v ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Play className="w-3 h-3 fill-current" />
                              )}
                              Start Run
                            </Button>
                          </CardHeader>
                          <CardContent className="p-4 pt-0">
                            <div className="flex items-center gap-4 mt-2">
                              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                <FlaskConical className="w-3 h-3" />
                                {v.evalCount} Evals
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                <CheckCircle2 className="w-3 h-3" />
                                {v.fixtureCount} Fixtures
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                {formatDateTime(v.createdAt)}
                              </div>
                            </div>

                            {v.status === "candidate" &&
                              (v.evalCount < 1 || v.fixtureCount < 1) && (
                                <div className="mt-3 flex items-center gap-2 p-2 rounded bg-yellow-500/10 border border-yellow-500/20 text-[10px] text-yellow-600">
                                  <AlertTriangle className="w-3 h-3" />
                                  Stable promotion requires at least 1 eval and 1 fixture.
                                </div>
                              )}
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </div>
              </ScrollArea>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <BookOpen className="w-12 h-12 mb-4 opacity-10" />
              <p className="text-sm italic">Select a recipe to view details and version history.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
